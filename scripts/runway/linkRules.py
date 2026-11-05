#!/usr/bin/env python3
"""Runway bank-link rules: a new plan, links, bank balances, linkId and grants.

Functions write links, balances and grants and set a card's or account's linkId; the owner only reads the first
two, creates cards and accounts unlinked and never changes linkId. Run by `npm run check:runway-rules`.
"""
import json, os, sys, time, urllib.request, urllib.error

FS_HOST = os.environ['FIRESTORE_EMULATOR_HOST']
AUTH_HOST = os.environ['FIREBASE_AUTH_EMULATOR_HOST']
PROJECT = os.environ.get('GCLOUD_PROJECT', 'demo-rules-matrix')
ROOT = f'projects/{PROJECT}/databases/(default)/documents/'
FS = f'http://{FS_HOST}/v1/' + ROOT

NOW = int(time.time() * 1000)
DAY = 86400000
TODAY = NOW // DAY * DAY
SEAL = {'value': 'x', 'nonce': 'n', 'keyId': 'k', 'keyVersion': 1, 'algorithm': 'AES-256-GCM'}

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
    o_tok, uid = signup('owner')
    x_tok, _ = signup('other')
    base = f'apps/runway/plans/{uid}'
    plan = dict(uid=uid, createdAt=NOW, updatedAt=NOW, stance='middle', startDate=None, trackingPeriods=[],
                dirtyFrom=None, keyId='k1', sealed=SEAL)
    check('plan create [o]', commit(o_tok, [put_new(base, plan)]), True)
    admin([put(base, plan)])
    for c in ('links', 'accountBalances'):
        admin([put(f'{base}/{c}/l1', dict(id='l1', sealed=SEAL))])
        check(f'{c} read [o]', get(f'{base}/{c}/l1', o_tok), True)
        check(f'{c} read [x]', get(f'{base}/{c}/l1', x_tok), False)
        check(f'{c} read [-]', get(f'{base}/{c}/l1', None), False)
        check(f'{c} create [o]', commit(o_tok, [put_new(f'{base}/{c}/l2', dict(id='l2', sealed=SEAL))]), False)
        check(f'{c} update [o]', commit(o_tok, [put(f'{base}/{c}/l1', dict(id='l1', sealed=SEAL, x=1))]), False)
        check(f'{c} delete [o]', commit(o_tok, [rm(f'{base}/{c}/l1')]), False)
    for c in ('cards', 'accounts'):
        check(f'{c} create linkId null [o]',
              commit(o_tok, [put_new(f'{base}/{c}/a1', dict(id='a1', linkId=None, sealed=SEAL))]), True)
        check(f'{c} create no linkId [o]', commit(o_tok, [put_new(f'{base}/{c}/a0', dict(id='a0', sealed=SEAL))]), True)
        check(f'{c} create linkId set [o]',
              commit(o_tok, [put_new(f'{base}/{c}/a2', dict(id='a2', linkId='l1', sealed=SEAL))]), False)
        check(f'{c} update set linkId [o]',
              commit(o_tok, [put(f'{base}/{c}/a1', dict(id='a1', linkId='l1', sealed=SEAL))]), False)
        admin([put(f'{base}/{c}/a3', dict(id='a3', linkId='l1', sealed=SEAL))])
        check(f'{c} update keep linkId [o]',
              commit(o_tok, [put(f'{base}/{c}/a3', dict(id='a3', linkId='l1', sealed=SEAL, z=1))]), True)
        check(f'{c} update clear linkId [o]',
              commit(o_tok, [put(f'{base}/{c}/a3', dict(id='a3', linkId=None, sealed=SEAL))]), False)
    grant = f'apps/runway/server/{uid}/grants/l1'
    admin([put(grant, {'x': 1})])
    check('grant read [o]', get(grant, o_tok), False)
    check('grant write [o]', commit(o_tok, [put(grant, {'x': 2})]), False)
    if mismatches:
        print('\n'.join('EXPECTATION MISMATCH ' + m for m in mismatches))
        sys.exit(1)
    print(f'runway link rules: {len(results)} cases ok')


main()
