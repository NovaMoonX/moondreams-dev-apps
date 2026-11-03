#!/usr/bin/env python3
"""Feature-switch rules matrix: creating a Waypoint trip (create-trips) and a Going Once sale (create-sales) as each kind of person under each switch setting.

Runs the shared case table (scripts/checks/gateCases.json) against `isGateOpen` in firestore.rules, with
each switch's guarded write, and a signed-out caller for every setting. Run by `npm run check:gate-rules`.
"""
import json, os, sys, time, urllib.request, urllib.error

FS_HOST = os.environ['FIRESTORE_EMULATOR_HOST']
AUTH_HOST = os.environ['FIREBASE_AUTH_EMULATOR_HOST']
PROJECT = os.environ.get('GCLOUD_PROJECT', 'demo-gate-rules')
ROOT = f'projects/{PROJECT}/databases/(default)/documents/'
NOW = int(time.time() * 1000)


def enc(v):
    if v is None: return {'nullValue': None}
    if isinstance(v, bool): return {'booleanValue': v}
    if isinstance(v, int): return {'integerValue': str(v)}
    if isinstance(v, str): return {'stringValue': v}
    if isinstance(v, list): return {'arrayValue': {'values': [enc(x) for x in v]}}
    if isinstance(v, dict): return {'mapValue': {'fields': {k: enc(x) for k, x in v.items()}}}
    raise TypeError(v)


def post(url, body, tok=None):
    h = {'Content-Type': 'application/json'}
    if tok: h['Authorization'] = 'Bearer ' + tok
    try:
        return json.load(urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), headers=h, method='POST')))
    except urllib.error.HTTPError as e:
        return e.code


def signup(email):
    r = post(f'http://{AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake',
             {'email': email, 'password': 'password-1', 'returnSecureToken': True})
    return r['idToken'], r['localId']


def verify(uid):
    post(f'http://{AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:update',
         {'localId': uid, 'emailVerified': True}, 'owner')


def write(path, data, tok, must_not_exist=False):
    w = {'update': {'name': ROOT + path, 'fields': {k: enc(v) for k, v in data.items()}}}
    if must_not_exist: w['currentDocument'] = {'exists': False}
    r = post(f'http://{FS_HOST}/v1/{ROOT}:commit'.replace('/documents/:commit', '/documents:commit'), {'writes': [w]}, tok)
    return 200 if isinstance(r, dict) else r


def delete(path):
    post(f'http://{FS_HOST}/v1/{ROOT}:commit'.replace('/documents/:commit', '/documents:commit'),
         {'writes': [{'delete': ROOT + path}]}, 'owner')


def trip(uid, n):
    return dict(id=f'trip-{n}', title='T', createdBy=uid, createdAt=NOW, members={uid: dict(uid=uid, role='ADMIN')})


def sale(uid, n):
    return dict(id=f'sale-{n}', name='S', pickupArea=None, buyerNote=None, currency='USD', ownerUid=uid, createdBy=uid,
                members=[uid], createdAt=NOW, lastEditedAt=None)


# (app, switch, collection, a new document for the caller)
GUARDED = [
    ('waypoint', 'create-trips', 'trips', trip),
    ('going-once', 'create-sales', 'sales', sale),
]


def main():
    cases = json.load(open(os.path.join(os.path.dirname(__file__), 'gateCases.json')))
    member_tok, member_uid = signup(f'member-{NOW}@rules.test')
    admin_tok, admin_uid = signup('nova@moondreams.dev')
    verify(admin_uid)
    admin_tok = post(f'http://{AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',
                     {'email': 'nova@moondreams.dev', 'password': 'password-1', 'returnSecureToken': True})['idToken']
    bad = []
    for app, gate, collection, make in GUARDED:
        for i, c in enumerate(cases):
            for kind, tok, uid in (('admin', admin_tok, admin_uid), ('member', member_tok, member_uid)):
                if (kind == 'admin') != c['isAdmin']: continue
                delete(f'featureGates/{app}')
                if c['setting'] is not None:
                    setting = c['setting']
                    if isinstance(setting, dict):
                        setting = dict(setting)
                        for key in ('alwaysOnUids', 'alwaysOffUids'):
                            if isinstance(setting.get(key), list): setting[key] = [uid if x == 'u' else x for x in setting[key]]
                        for key in ('alwaysOnUids', 'alwaysOffUids'):
                            if setting.get(key) == 'u': setting[key] = uid
                    assert write(f'featureGates/{app}', dict(appId=app, gates={gate: setting}), 'owner') == 200
                # The rules read the registry default for the switch ('everyone'); a case with another default only applies where a stored rollout decides.
                if c['defaultRollout'] != 'everyone' and (not isinstance(c['setting'], dict) or c['setting'].get('rollout') not in ('off', 'testing', 'everyone')): continue
                got = write(f'apps/{app}/{collection}/doc-{i}', make(uid, i), tok, True)
                if (got == 200) != c['expected']: bad.append(f"{app} {c['name']} [{kind}]: got {got}, expected {'allow' if c['expected'] else 'deny'}")
            delete(f'apps/{app}/{collection}/doc-{i}')
        delete(f'featureGates/{app}')
        got = write(f'apps/{app}/{collection}/signed-out', make('nobody', 0), None, True)
        if got == 200: bad.append(f'{app}: signed out created one')
        got = write(f'apps/{app}/{collection}/not-mine', make('someone-else', 1), member_tok, True)
        if got == 200: bad.append(f'{app}: creating one as someone else was allowed')
        if app == 'going-once':
            got = write(f'apps/{app}/{collection}/not-only-me', {**make(member_uid, 2), 'members': [member_uid, 'someone-else']}, member_tok, True)
            if got == 200: bad.append('going-once: a sale with another member was allowed')
    if bad:
        print('\n'.join(bad)); sys.exit(1)
    print(f'gate rules: ok ({len(cases)} cases x {len(GUARDED)} switches + signed out + not own)')


main()
