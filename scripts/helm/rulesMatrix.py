#!/usr/bin/env python3
"""Helm rules matrix (beta tier).

Reads and writes the profile at apps/helm/users/{uid} as its owner, a second signed-in user and a signed-out
visitor, and records each HTTP status. The beta tier checks access, not shape: only the owner may read, create and
update it, nobody may delete it, the owner alone may read, list, create, update and delete a turn under captures, tasks and noted facts follow the same rule, a synced copy is read and listed by its owner and written by no client, an execution may be read, created and updated by its owner but never deleted, and no other path under apps/helm is open to a client.

  npm run check:helm-rules                       # every case behaves as expected
  npm run check:helm-rules -- --out after.json   # statuses, to diff against another rules file's run
"""
import argparse, json, os, sys, time, urllib.request, urllib.error

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
    path = f'apps/helm/users/{uid}'
    profile = dict(timeZone='America/Los_Angeles', dayStartTime='08:00', dayEndTime='22:00', planFillPercent=50, createdAt=NOW, lastEditedAt=None)

    for a, tok in actors.items():
        admin([rm(path)])
        check(f'profile create [{a}]', commit(tok, [put_new(path, profile)]), a == 'o')
        admin([put(path, profile)])
        check(f'profile read [{a}]', get(path, tok), a == 'o')
        check(f'profile update [{a}]', commit(tok, [put(path, dict(profile, planFillPercent=60))]), a == 'o')
        check(f'profile delete [{a}]', commit(tok, [rm(path)]), False)
    check('profile create at another uid [o]', commit(o_tok, [put_new(f'apps/helm/users/{x_uid}', profile)]), False)

    # A turn is the owner's alone: read, list, create, update and delete.
    admin([put(path, profile)])
    turn = dict(inputMode='typed', medium='web', sessionId='s1', turnIndex=0, status='received', seenAt=None, createdAt=NOW, sealed=SEAL)
    cap = f'{path}/captures/capture-1'
    for a, tok in actors.items():
        admin([put(cap, turn)])
        check(f'captures read [{a}]', get(cap, tok), a == 'o')
        check(f'captures list [{a}]', get(f'{path}/captures', tok), a == 'o')
        check(f'captures create [{a}]', commit(tok, [put_new(cap + '-new-' + a, turn)]), a == 'o')
        check(f'captures update [{a}]', commit(tok, [put(cap, dict(turn, seenAt=NOW))]), a == 'o')
        check(f'captures delete [{a}]', commit(tok, [rm(cap)]), a == 'o')
        admin([rm(cap + '-new-' + a)])
    check('captures create at another uid [o]', commit(o_tok, [put_new(f'apps/helm/users/{x_uid}/captures/c', turn)]), False)
    check('captures read at another uid [o]', get(f'apps/helm/users/{x_uid}/captures/c', o_tok), False)

    # A task is the owner's alone.
    admin([put(path, profile)])
    task = dict(status='open', isUrgent=False, due=None, createdBy='nomos', createdAt=NOW, sealed=SEAL)
    tk = f'{path}/tasks/task-1'
    for a, tok in actors.items():
        admin([put(tk, task)])
        check(f'tasks read [{a}]', get(tk, tok), a == 'o')
        check(f'tasks list [{a}]', get(f'{path}/tasks', tok), a == 'o')
        check(f'tasks create [{a}]', commit(tok, [put_new(tk + '-new-' + a, task)]), a == 'o')
        check(f'tasks update [{a}]', commit(tok, [put(tk, dict(task, status='done'))]), a == 'o')
        check(f'tasks delete [{a}]', commit(tok, [rm(tk)]), a == 'o')
        admin([rm(tk + '-new-' + a)])
    check('tasks create at another uid [o]', commit(o_tok, [put_new(f'apps/helm/users/{x_uid}/tasks/t', task)]), False)

    # A noted fact is the owner's alone, like a task.
    fact = dict(status='inferred', stated='nomosInferred', syncedIds=['s1'], subjectIds=['s1'], createdAt=NOW, sealed=SEAL)
    fk = f'{path}/facts/fact-1'
    for a, tok in actors.items():
        admin([put(fk, fact)])
        check(f'facts read [{a}]', get(fk, tok), a == 'o')
        check(f'facts list [{a}]', get(f'{path}/facts', tok), a == 'o')
        check(f'facts create [{a}]', commit(tok, [put_new(fk + '-new-' + a, fact)]), a == 'o')
        check(f'facts update [{a}]', commit(tok, [put(fk, dict(fact, status='superseded'))]), a == 'o')
        check(f'facts delete [{a}]', commit(tok, [rm(fk)]), a == 'o')
        admin([rm(fk + '-new-' + a)])
    check('facts create at another uid [o]', commit(o_tok, [put_new(f'apps/helm/users/{x_uid}/facts/f', fact)]), False)

    # An execution is the owner's to read, create and update; nobody deletes one.
    run = dict(captureId='capture-1', actor='nomos', state='succeeded', undoneByExecutionId=None, createdAt=NOW, sealed=SEAL)
    ex = f'{path}/executions/exec-1'
    for a, tok in actors.items():
        admin([put(ex, run)])
        check(f'executions read [{a}]', get(ex, tok), a == 'o')
        check(f'executions list [{a}]', get(f'{path}/executions', tok), a == 'o')
        check(f'executions create [{a}]', commit(tok, [put_new(ex + '-new-' + a, run)]), a == 'o')
        check(f'executions update [{a}]', commit(tok, [put(ex, dict(run, undoneByExecutionId='exec-2'))]), a == 'o')
        check(f'executions delete [{a}]', commit(tok, [rm(ex)]), False)
        admin([rm(ex + '-new-' + a)])
    check('executions create at another uid [o]', commit(o_tok, [put_new(f'apps/helm/users/{x_uid}/executions/e', run)]), False)

    # A synced copy is the owner's to read and list; only the platform's functions write one.
    admin([put(path, profile)])
    copy = dict(grantId='g', category='c', kind='task', sourceRef='r', contentHash='h', syncedAt=NOW, transformVersion=1, connectionEndedAt=None, deleteAfter=None, sealed=SEAL)
    sy = f'{path}/synced/copy-1'
    for a, tok in actors.items():
        admin([put(sy, copy)])
        check(f'synced read [{a}]', get(sy, tok), a == 'o')
        check(f'synced list [{a}]', get(f'{path}/synced', tok), a == 'o')
        check(f'synced create [{a}]', commit(tok, [put_new(sy + '-new-' + a, copy)]), False)
        check(f'synced update [{a}]', commit(tok, [put(sy, dict(copy, syncedAt=NOW + 1))]), False)
        check(f'synced delete [{a}]', commit(tok, [rm(sy)]), False)
        admin([rm(sy + '-new-' + a)])
    check('synced read at another uid [o]', get(f'apps/helm/users/{x_uid}/synced/c', o_tok), False)

    # No other collection is opened yet, and the server-only paths refuse everyone.
    admin([put(path, profile)])
    for p in (f'{path}/meta/keyDateIndex', 'apps/helm/server/keyring', 'apps/helm/keyChecks/latest', f'voiceUsage/{uid}/days/2026-11-09', 'voiceBudget/2026-11-09'):
        admin([put(p, {'x': 1})])
        label = p.split("/")[0] if p.startswith('voice') else p.split("/")[-2]
        for a, tok in actors.items():
            check(f'{label} read [{a}]', get(p, tok), False)
            check(f'{label} create [{a}]', commit(tok, [put_new(p + '-new', {'x': 2})]), False)
            check(f'{label} write [{a}]', commit(tok, [put(p, {'x': 2})]), False)

    if args.out:
        with open(args.out, 'w') as f: json.dump(dict(sorted(results.items())), f, indent=1)
    allowed = sum(1 for v in results.values() if v == 200)
    print(f'{len(results)} cases, {allowed} allowed, {len(results) - allowed} refused')
    for m in mismatches: print('EXPECTATION MISMATCH', m)
    print(f'{len(mismatches)} expectation mismatches')
    sys.exit(1 if mismatches else 0)


main()
