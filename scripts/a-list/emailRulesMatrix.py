#!/usr/bin/env python3
"""A-List email rules matrix.

Reads and writes the collections under a member's A-List data, plus the Functions-only email paths, as the member, a
second signed-in user and a signed-out visitor, and records each HTTP status. The member may do exactly what the app
does to each collection; the email intake and events are written only by Functions.

  npm run check:a-list-email-rules                       # every case behaves as expected
  npm run check:a-list-email-rules -- --out after.json   # statuses, to diff against another rules file's run
"""
import argparse, json, os, sys, time, urllib.request, urllib.error

FS_HOST = os.environ['FIRESTORE_EMULATOR_HOST']
AUTH_HOST = os.environ['FIREBASE_AUTH_EMULATOR_HOST']
PROJECT = os.environ.get('GCLOUD_PROJECT', 'demo-rules-matrix')
ROOT = f'projects/{PROJECT}/databases/(default)/documents/'
FS = f'http://{FS_HOST}/v1/' + ROOT
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


def signup(tag):
    r = post(f'http://{AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake',
             {'email': f'{tag}-{NOW}@rules.test', 'password': 'password-1', 'returnSecureToken': True})
    return r['idToken'], r['localId']


def put(path, data):
    return {'update': {'name': ROOT + path, 'fields': {k: enc(v) for k, v in data.items()}}}


def put_new(path, data):
    x = put(path, data)
    x['currentDocument'] = {'exists': False}
    return x


def rm(path):
    return {'delete': ROOT + path}


def commit(tok, writes):
    r = post(FS.replace('/documents/', '/documents:commit'), {'writes': writes}, tok)
    return 200 if isinstance(r, dict) else r


def get(path, tok):
    h = {'Authorization': 'Bearer ' + tok} if tok else {}
    try:
        urllib.request.urlopen(urllib.request.Request(FS + path, headers=h)); return 200
    except urllib.error.HTTPError as e: return e.code


def admin(writes):
    assert commit('owner', writes) == 200, 'admin write failed'


results = {}
mismatches = []


def check(label, code, allowed):
    assert label not in results, label
    results[label] = code
    if (code == 200) != allowed:
        mismatches.append(f'{label}: got {code}, expected {"allow" if allowed else "deny"}')


# What the app does to each path under a member: create, read, update and delete, each allowed or not for the member.
FULL = {'create', 'read', 'update', 'delete'}
PATHS = {
    'viewings/v-1': FULL,
    'watchlist/tmdb-1': FULL,
    'theatres/2087': FULL,
    'viewings/v-1/notes/n-1': FULL,
    'emailSetup/progress': {'create', 'read', 'update'},
    'emailSetup/other': {'read'},
    'emailIntake/address': {'read'},
    'emailEvents/ev-1': {'read', 'delete'},
}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out'); args = ap.parse_args()
    o_tok, uid = signup('owner')
    x_tok, x_uid = signup('other')
    actors = {'o': o_tok, 'x': x_tok, 'a': None}
    base = f'apps/a-list/memberships/{uid}'

    member = dict(uid=uid, monthlyCostCents=2500, createdAt=NOW, lastEditedAt=NOW)
    for a, tok in actors.items():
        admin([rm(base)])
        check(f'membership create [{a}]', commit(tok, [put_new(base, member)]), a == 'o')
        admin([put(base, member)])
        check(f'membership read [{a}]', get(base, tok), a == 'o')
        check(f'membership update [{a}]', commit(tok, [put(base, dict(member, monthlyCostCents=2600))]), a == 'o')
        check(f'membership delete [{a}]', commit(tok, [rm(base)]), a == 'o')
    admin([put(base, member)])
    check('membership create at another uid [o]', commit(o_tok, [put_new(f'apps/a-list/memberships/{x_uid}', member)]), False)

    for path, ops in PATHS.items():
        doc = dict(id=path.rsplit('/', 1)[1], createdAt=NOW)
        full = f'{base}/{path}'
        for a, tok in actors.items():
            is_o = a == 'o'
            admin([rm(full)])
            check(f'{path} create [{a}]', commit(tok, [put_new(full, doc)]), is_o and 'create' in ops)
            admin([put(full, doc)])
            check(f'{path} read [{a}]', get(full, tok), is_o and 'read' in ops)
            check(f'{path} update [{a}]', commit(tok, [put(full, dict(doc, createdAt=NOW - 1))]), is_o and 'update' in ops)
            admin([put(full, doc)])
            check(f'{path} delete [{a}]', commit(tok, [rm(full)]), is_o and 'delete' in ops)
    admin([rm(f'{base}/emailSetup/progress'), rm(f'{base}/emailSetup/other')])

    # Undo may set undoneAt and nothing else on an event.
    ev = f'{base}/emailEvents/ev-1'
    ev_doc = dict(id='ev-1', outcome='added', undoneAt=None)
    for a, tok in actors.items():
        admin([put(ev, ev_doc)])
        check(f'emailEvents undoneAt only [{a}]', commit(tok, [put(ev, dict(ev_doc, undoneAt=NOW))]), a == 'o')
        check(f'emailEvents undoneAt and outcome [{a}]', commit(tok, [put(ev, dict(ev_doc, undoneAt=NOW, outcome='canceled'))]), False)
    admin([rm(ev)])

    # Another member's data is never the owner's to touch.
    theirs = f'apps/a-list/memberships/{x_uid}/emailEvents/ev-1'
    admin([put(theirs, dict(id='ev-1'))])
    check('another member emailEvents read [o]', get(theirs, o_tok), False)
    check('another member emailEvents delete [o]', commit(o_tok, [rm(theirs)]), False)

    for p in (f'apps/a-list/emailTokens/abcdefghijkl', f'apps/a-list/server/{uid}/emailRate/2026112221'):
        admin([put(p, {'x': 1})])
        for a, tok in actors.items():
            check(f'{p} read [{a}]', get(p, tok), False)
            check(f'{p} write [{a}]', commit(tok, [put(p, {'x': 2})]), False)
            check(f'{p} delete [{a}]', commit(tok, [rm(p)]), False)

    if args.out:
        with open(args.out, 'w') as f: json.dump(dict(sorted(results.items())), f, indent=1)
    allowed = sum(1 for v in results.values() if v == 200)
    print(f'{len(results)} cases, {allowed} allowed, {len(results) - allowed} refused')
    for m in mismatches: print('EXPECTATION MISMATCH', m)
    print(f'{len(mismatches)} expectation mismatches')
    sys.exit(1 if mismatches else 0)


main()
