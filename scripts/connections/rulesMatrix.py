#!/usr/bin/env python3
"""Connections rules matrix.

Reads and writes the site-level grant paths as their owner, a second signed-in user and a signed-out visitor, and
records each HTTP status. Only the owner may read a grant (or list them, or read an account); no client may create,
update or delete anything under connections/{uid}, and connectionsServer/ is closed to everyone. The same matrix then
runs against the base branch's rules (--base-ref's firestore.rules, loaded into the running emulator) and prints
the outcomes that differ: only the owner's reads should.

  npm run check:connections-rules
  npm run check:connections-rules -- --base-ref origin/main
"""
import argparse, json, os, subprocess, sys, time, urllib.request, urllib.error

FS_HOST = os.environ['FIRESTORE_EMULATOR_HOST']
AUTH_HOST = os.environ['FIREBASE_AUTH_EMULATOR_HOST']
PROJECT = os.environ.get('GCLOUD_PROJECT', 'demo-rules-matrix')
ROOT = f'projects/{PROJECT}/databases/(default)/documents/'
FS = f'http://{FS_HOST}/v1/' + ROOT

NOW = int(time.time() * 1000)
SEAL = {'value': 'x', 'nonce': 'n', 'keyId': 'k', 'keyVersion': 1, 'algorithm': 'AES-256-GCM'}
DAY = 86400000
TODAY = NOW // DAY * DAY

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



RULES_URL = f'http://{FS_HOST}/emulator/v1/projects/{PROJECT}:securityRules'
GRANT = dict(readerAppId='helm', connectorId='app:pinch', accountId='site', status='live', createdAt=NOW)


def load_rules(text):
    req = urllib.request.Request(RULES_URL, data=json.dumps({'rules': {'files': [{'name': 'firestore.rules', 'content': text}]}}).encode(),
                                 headers={'Content-Type': 'application/json'}, method='PUT')
    urllib.request.urlopen(req).read()


def run_matrix(o_tok, uid, x_tok, x_uid):
    results = {}
    actors = {'owner': o_tok, 'other': x_tok, 'signed out': None}
    grant = f'connections/{uid}/grants/helm__app:pinch__site'
    account = f'connections/{uid}/accounts/x'
    token = f'connectionsServer/{uid}/tokens/x'
    server_paths = {
        'oauth state': f'connectionsServer/{uid}/oauthStates/s',
        'cursor': f'connectionsServer/{uid}/cursors/c',
        'key check': 'connectionsServer/keyChecks/ids/k',
    }

    def check(label, code):
        assert label not in results, label
        results[label] = 'allow' if code == 200 else 'deny'

    for a, tok in actors.items():
        admin([put(grant, GRANT), put(account, {'provider': 'google'}), put(token, {'x': 1})])
        check(f'grant read [{a}]', get(grant, tok))
        check(f'grants list [{a}]', get(f'connections/{uid}/grants', tok))
        check(f'account read [{a}]', get(account, tok))
        check(f'accounts list [{a}]', get(f'connections/{uid}/accounts', tok))
        check(f'grant create [{a}]', commit(tok, [put_new(grant + '-new', GRANT)]))
        check(f'grant update [{a}]', commit(tok, [put(grant, dict(GRANT, status='ended'))]))
        check(f'grant delete [{a}]', commit(tok, [rm(grant)]))
        check(f'account create [{a}]', commit(tok, [put_new(account + '-new', {'provider': 'google'})]))
        check(f'account update [{a}]', commit(tok, [put(account, {'provider': 'x'})]))
        check(f'account delete [{a}]', commit(tok, [rm(account)]))
        check(f'server token read [{a}]', get(token, tok))
        check(f'server token create [{a}]', commit(tok, [put_new(token + '-new', {'x': 2})]))
        check(f'server token update [{a}]', commit(tok, [put(token, {'x': 2})]))
        check(f'server token delete [{a}]', commit(tok, [rm(token)]))
        for name, path in server_paths.items():
            admin([put(path, {'x': 1})])
            check(f'server {name} read [{a}]', get(path, tok))
            check(f'server {name} write [{a}]', commit(tok, [put(path, {'x': 2})]))
        admin([rm(grant + '-new'), rm(account + '-new'), rm(token + '-new')])
    admin([put(f'connections/{x_uid}/grants/g', GRANT)])
    check('other uid grant read [owner]', get(f'connections/{x_uid}/grants/g', o_tok))
    check('other uid grant create [owner]', commit(o_tok, [put_new(f'connections/{x_uid}/grants/new', GRANT)]))
    return results


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--base-ref', default='origin/main'); args = ap.parse_args()
    o_tok, uid = signup('owner')
    x_tok, x_uid = signup('other')

    current = run_matrix(o_tok, uid, x_tok, x_uid)
    mismatches = [f'{label}: got {got}' for label, got in current.items()
                  if got != ('allow' if label.split(' [')[0] in ('grant read', 'grants list', 'account read', 'accounts list') and label.endswith('[owner]') else 'deny')]
    for label, got in current.items(): print(f'  {got:5} {label}')
    print(f'{len(current)} cases, {sum(1 for v in current.values() if v == "allow")} allowed')

    shown = subprocess.run(['git', 'show', f'{args.base_ref}:firestore.rules'], capture_output=True, text=True)
    if shown.returncode != 0:
        print(f'Base rules ({args.base_ref}) not available here: comparison skipped')
    else:
        current_text = open('firestore.rules').read()
        load_rules(shown.stdout)
        try:
            base = run_matrix(o_tok, uid, x_tok, x_uid)
        finally:
            load_rules(current_text)
        differs = [label for label in current if current[label] != base[label]]
        print(f'Against the base rules ({args.base_ref}): {len(differs)} outcomes differ')
        for label in differs: print(f'  {label}: base {base[label]}, now {current[label]}')

    for m in mismatches: print('EXPECTATION MISMATCH', m)
    print(f'{len(mismatches)} expectation mismatches')
    sys.exit(1 if mismatches else 0)


main()
