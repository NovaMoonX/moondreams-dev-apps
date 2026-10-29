#!/usr/bin/env python3
"""Runway rules matrix (beta tier).

Reads and writes every collection under apps/runway as the plan's owner, a second signed-in user and a
signed-out visitor, and records each HTTP status. The beta tier checks access, not shape: the owner may do
exactly what the app does to each collection, and nobody else may do anything.

  npm run check:runway-rules                       # every case behaves as expected
  npm run check:runway-rules -- --out after.json   # statuses, to diff against another rules file's run
"""
import argparse, json, os, sys, time, urllib.request, urllib.error

FS_HOST = os.environ['FIRESTORE_EMULATOR_HOST']
AUTH_HOST = os.environ['FIREBASE_AUTH_EMULATOR_HOST']
PROJECT = os.environ.get('GCLOUD_PROJECT', 'demo-rules-matrix')
ROOT = f'projects/{PROJECT}/databases/(default)/documents/'
FS = f'http://{FS_HOST}/v1/' + ROOT

NOW = int(time.time() * 1000)
DAY = 86400000
TODAY = NOW // DAY * DAY
SEAL = {'value': 'x', 'nonce': 'n', 'keyId': 'k', 'keyVersion': 1, 'algorithm': 'AES-256-GCM'}

# What the app does to each collection under a plan. The owner may create and read under any other name too (the
# plan's wildcard), but never update or delete there.
COLLECTIONS = {
    'items': {'update'},
    'versions': set(),
    'changes': set(),
    'days': {'update'},
    'purchases': {'update', 'delete'},
    'closings': {'update', 'delete'},
    'moves': set(),
    'cards': {'update'},
}


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


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out'); args = ap.parse_args()
    o_tok, uid = signup('owner')
    x_tok, x_uid = signup('other')
    actors = {'o': o_tok, 'x': x_tok, 'a': None}
    base = f'apps/runway/plans/{uid}'
    plan = dict(uid=uid, createdAt=NOW, updatedAt=NOW, stance='middle', startDate=None, trackingPeriods=[], dirtyFrom=None, keyId='k1', sealed=SEAL)

    for a, tok in actors.items():
        admin([rm(base)])
        check(f'plan create [{a}]', commit(tok, [put_new(base, plan)]), a == 'o')
        admin([put(base, plan)])
        check(f'plan read [{a}]', get(base, tok), a == 'o')
        check(f'plan update [{a}]', commit(tok, [put(base, dict(plan, stance='optimistic'))]), a == 'o')
        check(f'plan delete [{a}]', commit(tok, [rm(base)]), False)
    check('plan create at another uid [o]', commit(o_tok, [put_new(f'apps/runway/plans/{x_uid}', dict(plan, uid=x_uid))]), False)

    admin([put(base, plan)])
    for c, ops in COLLECTIONS.items():
        path = f'{base}/{c}/{c}-1'
        doc = dict(id=f'{c}-1', createdAt=NOW, sealed=SEAL)
        for a, tok in actors.items():
            admin([rm(path)])
            check(f'{c} create [{a}]', commit(tok, [put_new(path, doc)]), a == 'o')
            admin([put(path, doc)])
            check(f'{c} read [{a}]', get(path, tok), a == 'o')
            check(f'{c} update [{a}]', commit(tok, [put(path, dict(doc, createdAt=NOW - DAY))]), a == 'o' and 'update' in ops)
            admin([put(path, doc)])
            check(f'{c} delete [{a}]', commit(tok, [rm(path)]), a == 'o' and 'delete' in ops)
            admin([put(path, doc)])
            check(f'{c} write twice by id [{a}]', commit(tok, [put(path, doc)]), a == 'o' and 'update' in ops)

    other = f'{base}/unlisted/doc-1'
    for a, tok in actors.items():
        admin([rm(other)])
        check(f'unlisted create [{a}]', commit(tok, [put_new(other, {'x': 1})]), a == 'o')
        admin([put(other, {'x': 1})])
        check(f'unlisted read [{a}]', get(other, tok), a == 'o')
        check(f'unlisted update [{a}]', commit(tok, [put(other, {'x': 2})]), False)
        check(f'unlisted delete [{a}]', commit(tok, [rm(other)]), False)

    rec = f'{base}/days/day-1/records/day-1_confirmed'
    rdoc = dict(id='day-1_confirmed', dayId='day-1', kind='confirmed', createdAt=NOW, sealed=SEAL)
    for a, tok in actors.items():
        admin([rm(rec)])
        check(f'record create [{a}]', commit(tok, [put_new(rec, rdoc)]), a == 'o')
        admin([put(rec, rdoc)])
        check(f'record read [{a}]', get(rec, tok), a == 'o')
        check(f'record update [{a}]', commit(tok, [put(rec, dict(rdoc, kind='proposed'))]), False)
        check(f'record delete [{a}]', commit(tok, [rm(rec)]), False)

    for p in ('apps/runway/server/keyring', 'apps/runway/keyChecks/latest'):
        admin([put(p, {'x': 1})])
        for a, tok in actors.items():
            check(f'{p} read [{a}]', get(p, tok), False)
            check(f'{p} write [{a}]', commit(tok, [put(p, {'x': 2})]), False)

    if args.out:
        with open(args.out, 'w') as f: json.dump(dict(sorted(results.items())), f, indent=1)
    allowed = sum(1 for v in results.values() if v == 200)
    print(f'{len(results)} cases, {allowed} allowed, {len(results) - allowed} refused')
    for m in mismatches: print('EXPECTATION MISMATCH', m)
    print(f'{len(mismatches)} expectation mismatches')
    sys.exit(1 if mismatches else 0)


main()
