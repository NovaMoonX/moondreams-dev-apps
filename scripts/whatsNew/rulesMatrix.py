#!/usr/bin/env python3
"""What's new seen-marks rules matrix.

Reads and writes whatsNewSeen/{uid} as the owner, a second signed-in user and a signed-out visitor. Only the owner may
read, create or update it, and only with the documented shape; nobody may delete it. The same matrix then runs against
the base branch's rules, where the path has no match: every outcome is deny, so only the owner's allows differ.

  firebase emulators:exec --only auth,firestore --project demo-rules-matrix "python3 scripts/whatsNew/rulesMatrix.py"
"""
import argparse, json, os, subprocess, sys, time, urllib.request, urllib.error

FS_HOST = os.environ['FIRESTORE_EMULATOR_HOST']
AUTH_HOST = os.environ['FIREBASE_AUTH_EMULATOR_HOST']
PROJECT = os.environ.get('GCLOUD_PROJECT', 'demo-rules-matrix')
ROOT = f'projects/{PROJECT}/databases/(default)/documents/'
FS = f'http://{FS_HOST}/v1/' + ROOT
RULES_URL = f'http://{FS_HOST}/emulator/v1/projects/{PROJECT}:securityRules'

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


def put(path, data, mask=None):
    x = {'update': {'name': ROOT + path, 'fields': {k: enc(v) for k, v in data.items()}}}
    if mask: x['updateMask'] = {'fieldPaths': mask}
    return x


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


def load_rules(text):
    req = urllib.request.Request(RULES_URL, data=json.dumps({'rules': {'files': [{'name': 'firestore.rules', 'content': text}]}}).encode(),
                                 headers={'Content-Type': 'application/json'}, method='PUT')
    urllib.request.urlopen(req).read()


def run_matrix(o_tok, uid, x_tok):
    results = {}
    doc = f'whatsNewSeen/{uid}'
    valid = dict(uid=uid, seen={'runway': 3}, showFixOnly=None, updatedAt=NOW)

    def check(label, code):
        assert label not in results, label
        results[label] = 'allow' if code == 200 else 'deny'

    def fresh():
        admin([put(doc, valid)])

    admin([rm(doc)])
    check('create valid [owner]', commit(o_tok, [put_new(doc, valid)]))
    fresh()
    check('read [owner]', get(doc, o_tok))
    check('update seen.runway field [owner]', commit(o_tok, [put(doc, {'seen': {'runway': 4}}, ['seen.runway'])]))
    fresh()
    check('update showFixOnly false [owner]', commit(o_tok, [put(doc, dict(valid, showFixOnly=False))]))
    admin([put(doc, dict(valid, showFixOnly=False))])
    check('update showFixOnly back to null [owner]', commit(o_tok, [put(doc, valid)]))

    bad = {
        'extra key': dict(valid, extra=1),
        'uid mismatch': dict(valid, uid='someone-else'),
        'seen not a map': dict(valid, seen='runway'),
        'seen over 20 keys': dict(valid, seen={f'app{i}': 1 for i in range(21)}),
        'showFixOnly a string': dict(valid, showFixOnly='yes'),
        'updatedAt missing': {k: v for k, v in valid.items() if k != 'updatedAt'},
    }
    for name, data in bad.items():
        admin([rm(doc)])
        check(f'create invalid, {name} [owner]', commit(o_tok, [put_new(doc, data)]))
        fresh()
        check(f'update invalid, {name} [owner]', commit(o_tok, [put(doc, data)]))

    fresh()
    check('delete [owner]', commit(o_tok, [rm(doc)]))

    for a, tok in {'other': x_tok, 'signed out': None}.items():
        fresh()
        check(f'read [{a}]', get(doc, tok))
        check(f'update [{a}]', commit(tok, [put(doc, dict(valid, showFixOnly=False))]))
        check(f'delete [{a}]', commit(tok, [rm(doc)]))
        admin([rm(doc)])
        check(f'create [{a}]', commit(tok, [put_new(doc, valid)]))
    return results


OWNER_ALLOWS = ('create valid [owner]', 'read [owner]', 'update seen.runway field [owner]',
                'update showFixOnly false [owner]', 'update showFixOnly back to null [owner]')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base-ref', default='origin/main')
    ap.add_argument('--rules', default='firestore.rules')
    args = ap.parse_args()
    o_tok, uid = signup('owner')
    x_tok, _ = signup('other')

    current = run_matrix(o_tok, uid, x_tok)
    mismatches = [f'{label}: got {got}' for label, got in current.items()
                  if got != ('allow' if label in OWNER_ALLOWS else 'deny')]
    for label, got in current.items(): print(f'  {got:5} {label}')
    print(f'{len(current)} cases, {sum(1 for v in current.values() if v == "allow")} allowed')

    shown = subprocess.run(['git', 'show', f'{args.base_ref}:firestore.rules'], capture_output=True, text=True)
    if shown.returncode != 0:
        print(f'Base rules ({args.base_ref}) not available here: comparison skipped')
    else:
        current_text = open(args.rules).read()
        load_rules(shown.stdout)
        try:
            base = run_matrix(o_tok, uid, x_tok)
        finally:
            load_rules(current_text)
        differs = [label for label in current if current[label] != base[label]]
        print(f'Against the base rules ({args.base_ref}): {len(differs)} outcomes differ')
        for label in differs: print(f'  {label}: base {base[label]}, now {current[label]}')
        mismatches += [f'{label}: base rules allowed it' for label, got in base.items() if got != 'deny']

    for m in mismatches: print('EXPECTATION MISMATCH', m)
    print(f'{len(mismatches)} expectation mismatches')
    sys.exit(1 if mismatches else 0)


main()
