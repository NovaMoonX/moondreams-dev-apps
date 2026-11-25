#!/usr/bin/env python3
"""Pinch outside-changes rules matrix.

An outside assistant's change record (apps/pinch/kitchens/{uid}/outsideChanges/{id}) is readable by its owner and
written by no client; the rest of the kitchen stays the owner's to read and write. Each case runs as the owner, a second
signed-in user and a signed-out visitor, then again against the base branch's rules so only the intended outcomes differ.

  npm run check:pinch-rules
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
CHANGE = dict(id='c1', kind='shoppingAdded', title='Flour', lines=['Added 2'], createdAt=NOW)


def load_rules(text):
    req = urllib.request.Request(RULES_URL, data=json.dumps({'rules': {'files': [{'name': 'firestore.rules', 'content': text}]}}).encode(),
                                 headers={'Content-Type': 'application/json'}, method='PUT')
    urllib.request.urlopen(req).read()


def run_matrix(o_tok, uid, x_tok):
    results = {}
    actors = {'owner': o_tok, 'other': x_tok, 'signed out': None}
    change = f'apps/pinch/kitchens/{uid}/outsideChanges/c1'
    recipe = f'apps/pinch/kitchens/{uid}/recipes/r1'

    def check(label, code):
        assert label not in results, label
        results[label] = 'allow' if code == 200 else 'deny'

    for a, tok in actors.items():
        admin([put(change, CHANGE), put(recipe, {'title': 'Soup'})])
        check(f'change read [{a}]', get(change, tok))
        check(f'changes list [{a}]', get(f'apps/pinch/kitchens/{uid}/outsideChanges', tok))
        check(f'change create [{a}]', commit(tok, [put_new(change + '-new', CHANGE)]))
        check(f'change update [{a}]', commit(tok, [put(change, dict(CHANGE, undoneAt=NOW, undoneBy='pinch'))]))
        check(f'change delete [{a}]', commit(tok, [rm(change)]))
        check(f'recipe read [{a}]', get(recipe, tok))
        check(f'recipe update [{a}]', commit(tok, [put(recipe, {'title': 'Stew'})]))
        check(f'recipe create [{a}]', commit(tok, [put_new(recipe + '-new', {'title': 'Pie'})]))
        admin([rm(change + '-new'), rm(recipe + '-new')])
    return results


EXPECT_ALLOW = {'change read [owner]', 'changes list [owner]', 'recipe read [owner]', 'recipe update [owner]', 'recipe create [owner]'}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--base-ref', default='origin/main'); args = ap.parse_args()
    o_tok, uid = signup('owner')
    x_tok, _ = signup('other')

    current = run_matrix(o_tok, uid, x_tok)
    mismatches = [f'{label}: got {got}' for label, got in current.items()
                  if got != ('allow' if label in EXPECT_ALLOW else 'deny')]
    for label, got in current.items(): print(f'  {got:5} {label}')
    print(f'{len(current)} cases, {sum(1 for v in current.values() if v == "allow")} allowed')

    shown = subprocess.run(['git', 'show', f'{args.base_ref}:firestore.rules'], capture_output=True, text=True)
    if shown.returncode != 0:
        print(f'Base rules ({args.base_ref}) not available here: comparison skipped')
    else:
        current_text = open('firestore.rules').read()
        load_rules(shown.stdout)
        try:
            base = run_matrix(o_tok, uid, x_tok)
        finally:
            load_rules(current_text)
        differs = [label for label in current if current[label] != base[label]]
        print(f'Against the base rules ({args.base_ref}): {len(differs)} outcomes differ')
        for label in differs: print(f'  {label}: base {base[label]}, now {current[label]}')

    for m in mismatches: print('EXPECTATION MISMATCH', m)
    print(f'{len(mismatches)} expectation mismatches')
    sys.exit(1 if mismatches else 0)


main()
