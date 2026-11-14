#!/usr/bin/env python3
"""MCP clients rules matrix.

Reads and writes mcpClients/{uid}/clients/{clientKey} and the server-only mcpServer/ identity cache as the owner, a
second signed-in user and a signed-out visitor. Only the owner may read a client (or list them); no client may
create, update or delete one, and mcpServer/ is closed to everyone. The same matrix then runs against the base
branch's rules and prints the outcomes that differ: only the owner's reads should.

  firebase emulators:exec --only auth,firestore --project demo-rules-matrix "python3 scripts/mcp/rulesMatrix.py"
"""
import argparse, json, os, subprocess, sys, time, urllib.request, urllib.error

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



KEY = '0123456789abcdef0123456789abcdef'
CLIENT = dict(appId='helm', clientId='https://claude.ai/oauth/client.json', name='Claude', workosUserId='wos_1',
              firstSeenAt=NOW, lastUsedAt=NOW, canWrite=True, revokedAt=None)
RULES_URL = f'http://{FS_HOST}/emulator/v1/projects/{PROJECT}:securityRules'


def load_rules(text):
    req = urllib.request.Request(RULES_URL, data=json.dumps({'rules': {'files': [{'name': 'firestore.rules', 'content': text}]}}).encode(),
                                 headers={'Content-Type': 'application/json'}, method='PUT')
    urllib.request.urlopen(req).read()


def run_matrix(o_tok, uid, x_tok, x_uid):
    results = {}
    actors = {'owner': o_tok, 'other': x_tok, 'signed out': None}
    client = f'mcpClients/{uid}/clients/{KEY}'
    identity = 'mcpServer/identities/users/wos_1'

    def check(label, code):
        assert label not in results, label
        results[label] = 'allow' if code == 200 else 'deny'

    for a, tok in actors.items():
        admin([put(client, CLIENT), put(identity, {'uid': uid, 'cachedAt': NOW})])
        check(f'client read [{a}]', get(client, tok))
        check(f'clients list [{a}]', get(f'mcpClients/{uid}/clients', tok))
        check(f'client create [{a}]', commit(tok, [put_new(client + '-new', CLIENT)]))
        check(f'client update canWrite [{a}]', commit(tok, [put(client, dict(CLIENT, canWrite=False))]))
        check(f'client update revokedAt [{a}]', commit(tok, [put(client, dict(CLIENT, revokedAt=NOW))]))
        check(f'client delete [{a}]', commit(tok, [rm(client)]))
        check(f'identity read [{a}]', get(identity, tok))
        check(f'identity write [{a}]', commit(tok, [put(identity, {'uid': x_uid, 'cachedAt': NOW})]))
        admin([rm(client + '-new')])
    admin([put(f'mcpClients/{x_uid}/clients/{KEY}', CLIENT)])
    check('other uid client read [owner]', get(f'mcpClients/{x_uid}/clients/{KEY}', o_tok))
    check('other uid client create [owner]', commit(o_tok, [put_new(f'mcpClients/{x_uid}/clients/new', CLIENT)]))
    return results


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--base-ref', default='origin/main'); args = ap.parse_args()
    o_tok, uid = signup('owner')
    x_tok, x_uid = signup('other')

    current = run_matrix(o_tok, uid, x_tok, x_uid)
    mismatches = [f'{label}: got {got}' for label, got in current.items()
                  if got != ('allow' if label.split(' [')[0] in ('client read', 'clients list') and label.endswith('[owner]') else 'deny')]
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
