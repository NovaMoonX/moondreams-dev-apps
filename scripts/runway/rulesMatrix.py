#!/usr/bin/env python3
"""Runway rules regression matrix.

Writes and reads every collection under apps/runway as the plan's owner, a second signed-in user and a
signed-out visitor, and records each HTTP status. A rules refactor must leave the JSON identical.

  npm run check:runway-rules                       # every case behaves as its author expects
  npm run check:runway-rules -- --out after.json   # statuses, to diff against another rules file's run
"""
import argparse, json, os, sys, time, urllib.request, urllib.error

FS_HOST = os.environ['FIRESTORE_EMULATOR_HOST']
AUTH_HOST = os.environ['FIREBASE_AUTH_EMULATOR_HOST']
PROJECT = os.environ.get('GCLOUD_PROJECT', 'demo-rules-matrix')
ROOT = f'projects/{PROJECT}/databases/(default)/documents/'
FS = f'http://{FS_HOST}/v1/' + ROOT

NOW = int(time.time() * 1000)
HOUR = 3600000
DAY = 86400000
TODAY = NOW // DAY * DAY
SEAL = {'value': 'x', 'nonce': 'n', 'keyId': 'k', 'keyVersion': 1, 'algorithm': 'AES-256-GCM'}


def stamp(ms):
    return time.strftime('%Y%m%d', time.gmtime(ms / 1000))


class Ts(int):
    """A Firestore timestamp value (epoch milliseconds)."""


def enc(v):
    if v is None: return {'nullValue': None}
    if isinstance(v, Ts): return {'timestampValue': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(v / 1000))}
    if isinstance(v, float): return {'doubleValue': v}
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
        if os.environ.get('RULES_MATRIX_DEBUG') and e.code >= 500: print('HTTP', e.code, e.read()[:300])
        return e.code


_signups = [0]


def signup(tag):
    _signups[0] += 1
    r = post(f'http://{AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake',
             {'email': f'{tag}{_signups[0]}@rules.test', 'password': 'password-1', 'returnSecureToken': True})
    return r['idToken'], r['localId']


def put(path, data, mask=None):
    x = {'update': {'name': ROOT + path, 'fields': {k: enc(v) for k, v in data.items()}}}
    if mask is not None: x['updateMask'] = {'fieldPaths': mask}
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
    r = commit('owner', writes)
    assert r == 200, ('admin write failed', r)


results = {}
mismatches = []
X_TOK, X_UID = signup('other')


class World:
    def __init__(self, tag, plan=True, **over):
        self.tok, self.uid = signup(tag)
        self.base = f'apps/runway/plans/{self.uid}'
        self.plan_doc = dict(uid=self.uid, createdAt=NOW - DAY, updatedAt=NOW - DAY, stance='middle', startDate=TODAY - 10 * DAY,
                             trackingPeriods=[{'from': TODAY - 60 * DAY, 'to': TODAY - 40 * DAY}, {'from': TODAY - 30 * DAY, 'to': None}],
                             dirtyFrom=None, keyId='k1', sealed=SEAL)
        self.plan_doc.update(over)
        if plan: self.reset()

    def reset(self):
        admin([put(self.base, self.plan_doc)])

    def p(self, rel):
        return self.base + '/' + rel if rel else self.base

    def actor(self, a):
        return {'o': self.tok, 'x': X_TOK, 'a': None}[a]


def run(label, w, actor, writes, expect=None, pre=(), reset=False):
    """One commit as actor o (owner), x (second user) or a (signed out)."""
    assert label not in results, label
    if pre: admin(list(pre))
    code = commit(w.actor(actor), writes)
    results[label] = code
    if reset: w.reset()
    if expect and (code == 200) != (expect == 'allow'):
        mismatches.append(f'{label}: got {code}, expected {expect}')


def read(label, w, actor, rel, expect=None):
    assert label not in results, label
    code = get(w.p(rel) if w else rel, w.actor(actor) if w else None)
    results[label] = code
    if expect and (code == 200) != (expect == 'allow'):
        mismatches.append(f'{label}: got {code}, expected {expect}')


def triple(label, w, writes, pre=()):
    """The same write as the owner (allow expected), a second user and a signed-out visitor (deny)."""
    run(label + ' [o]', w, 'o', writes, 'allow', pre)
    run(label + ' [x]', w, 'x', writes, 'deny')
    run(label + ' [a]', w, 'a', writes, 'deny')


n = [0]


def nid(prefix='i'):
    n[0] += 1
    return f'{prefix}{n[0]}'


def nid_count():
    n[0] += 1
    return n[0]


SEALED_VARIANTS = [
    ('ok', SEAL, 'allow'),
    ('ok with ciphertext', dict(SEAL, ciphertext='c'), 'allow'),
    ('no value', {k: v for k, v in SEAL.items() if k != 'value'}, 'deny'),
    ('no nonce', {k: v for k, v in SEAL.items() if k != 'nonce'}, 'deny'),
    ('no keyId', {k: v for k, v in SEAL.items() if k != 'keyId'}, 'deny'),
    ('no keyVersion', {k: v for k, v in SEAL.items() if k != 'keyVersion'}, 'deny'),
    ('no algorithm', {k: v for k, v in SEAL.items() if k != 'algorithm'}, 'deny'),
    ('extra key', dict(SEAL, amount=5), 'deny'),
    ('value number', dict(SEAL, value=1), 'deny'),
    ('nonce number', dict(SEAL, nonce=1), 'deny'),
    ('keyId number', dict(SEAL, keyId=1), 'deny'),
    ('keyVersion string', dict(SEAL, keyVersion='1'), 'deny'),
    ('algorithm other', dict(SEAL, algorithm='AES-128-GCM'), 'deny'),
    ('empty map', {}, 'deny'),
    ('string', 'x', 'deny'),
    ('list', ['x'], 'deny'),
    ('null', None, 'deny'),
]

ITEM_KINDS = ['source', 'payLine', 'bill', 'envelope', 'goal', 'group']
CHANGE_KINDS = ['planChange', 'start', 'levelMove', 'whatIfApplied', 'ended', 'correction', 'purchaseChange']


def item_doc(id, kind='bill', **o):
    d = dict(id=id, kind=kind, parentId=None, createdAt=NOW, endedAt=None, archivedAt=None)
    d.update(o); return d


def change_doc(id, kind='planChange', **o):
    d = dict(id=id, kind=kind, createdAt=NOW, effectiveFrom=TODAY + 40 * DAY, itemIds=['a'], sealed=SEAL)
    d.update(o); return d


def version_doc(id, itemId, kind='bill', changeId='chg', **o):
    d = dict(id=id, itemId=itemId, kind=kind, createdAt=NOW, effectiveFrom=TODAY + 40 * DAY, effectiveUntil=None, changeId=changeId, sealed=SEAL)
    d.update(o); return d


def without(d, *keys):
    return {k: v for k, v in d.items() if k not in keys}


# ---------------------------------------------------------------------------------------------------------
# server paths, key canaries and anything else under the app
# ---------------------------------------------------------------------------------------------------------
def server_paths():
    w = World('srv')
    admin([put(f'apps/runway/server/{w.uid}/keys/data', {'k': 'v'}), put('apps/runway/keyChecks/m1', {'k': 'v'}),
           put(w.p('mystery/m1'), {'k': 'v'}), put('apps/runway/other/o1', {'k': 'v'})])
    for path in [f'apps/runway/server/{w.uid}/keys/data', 'apps/runway/server/s1', 'apps/runway/keyChecks/m1', 'apps/runway/keyChecks/m2/deep/er',
                 w.p('mystery/m1'), 'apps/runway/other/o1', w.p('items/a/records/b'), w.p('days/a/records/b/c/d'), w.p('days/a/other/b'),
                 w.p('moves/a/b/c'), w.p('versions/a/records/a_confirmed')]:
        for a in 'oxa':
            name = path.replace(w.uid, 'UID')
            results[f'path {name} read [{a}]'] = get(path, w.actor(a))
            results[f'path {name} write [{a}]'] = commit(w.actor(a), [put(path, {'k': 'w'})])
            results[f'path {name} delete [{a}]'] = commit(w.actor(a), [rm(path)])
    for coll in [f'apps/runway/server/{w.uid}/keys', 'apps/runway/keyChecks', w.p('mystery'), 'apps/runway/other']:
        for a in 'oxa':
            results[f'path list {coll.replace(w.uid, "UID")} [{a}]'] = get(coll, w.actor(a))
    for coll in ['items', 'versions', 'changes', 'days', 'purchases', 'closings', 'moves']:
        for a in 'oxa':
            read(f'list {coll} [{a}]', w, a, coll, 'allow' if a == 'o' else 'deny')
    for a in 'oxa':
        read(f'read nonexistent plan [{a}]', w, a, '', None)
        read(f'read plan [{a}]', w, a, '', 'allow' if a == 'o' else 'deny')
    nop = World('nop', plan=False)
    for a in 'oxa':
        read(f'read missing plan doc [{a}]', nop, a, '')
        read(f'read missing item [{a}]', nop, a, 'items/zz')


# ---------------------------------------------------------------------------------------------------------
# plan document
# ---------------------------------------------------------------------------------------------------------
def plan_doc():
    w = World('plan')

    def create_doc(**o):
        d = dict(uid=w.uid, createdAt=NOW, updatedAt=NOW, stance='conservative', startDate=None, dirtyFrom=None, keyId='k1', sealed=SEAL)
        d.update(o); return d

    def create(label, doc, expect):
        run(f'plan create {label}', w, 'o', [put(w.base, doc)], expect, pre=[rm(w.base)])

    triple('plan create valid', w, [put(w.base, create_doc())], pre=[rm(w.base)])
    for key in ['uid', 'createdAt', 'updatedAt', 'stance', 'startDate', 'dirtyFrom', 'keyId', 'sealed']:
        create(f'without {key}', without(create_doc(), key), 'deny')
    create('trackingPeriods empty list', create_doc(trackingPeriods=[]), 'allow')
    create('trackingPeriods one period', create_doc(trackingPeriods=[{'from': TODAY, 'to': None}]), 'deny')
    create('extra key', create_doc(note='x'), 'deny')
    create('startDate set', create_doc(startDate=TODAY), 'deny')
    create('dirtyFrom set', create_doc(dirtyFrom='2026-05'), 'deny')
    create('uid of another', create_doc(uid=X_UID), 'deny')
    create('uid number', create_doc(uid=1), 'deny')
    for s in ['conservative', 'middle', 'optimistic', 'bold', '']:
        create(f'stance {s!r}', create_doc(stance=s), 'allow' if s in ('conservative', 'middle', 'optimistic') else 'deny')
    create('stance number', create_doc(stance=1), 'deny')
    create('stance null', create_doc(stance=None), 'deny')
    create('createdAt string', create_doc(createdAt='1'), 'deny')
    create('createdAt null', create_doc(createdAt=None), 'deny')
    create('createdAt an hour less a minute ahead', create_doc(createdAt=NOW + HOUR - 60000), 'allow')
    create('createdAt an hour and a minute ahead', create_doc(createdAt=NOW + HOUR + 60000), 'deny')
    create('updatedAt an hour less a minute ahead', create_doc(updatedAt=NOW + HOUR - 60000), 'allow')
    create('updatedAt an hour and a minute ahead', create_doc(updatedAt=NOW + HOUR + 60000), 'deny')
    create('updatedAt string', create_doc(updatedAt='1'), 'deny')
    create('createdAt zero', create_doc(createdAt=0), 'allow')
    create('keyId null', create_doc(keyId=None), 'allow')
    create('keyId number', create_doc(keyId=1), 'deny')
    create('sealed null', create_doc(sealed=None), 'allow')
    for name, value, exp in SEALED_VARIANTS:
        if name == 'null': continue
        create(f'sealed {name}', create_doc(sealed=value), exp)

    # updates
    def update(label, body, mask=None, actor='o', expect=None, base=None, legacy_drop=()):
        doc = dict(w.plan_doc, **(base or {}))
        doc = without(doc, *legacy_drop)
        run(f'plan update {label} [{actor}]', w, actor, [put(w.base, body, mask if mask is not None else list(body))], expect, pre=[put(w.base, doc)])

    update('stance', {'stance': 'optimistic', 'updatedAt': NOW}, expect='allow')
    for a in 'xa': update('stance', {'stance': 'optimistic', 'updatedAt': NOW}, actor=a, expect='deny')
    update('stance invalid', {'stance': 'bold'}, expect='deny')
    update('stance number', {'stance': 1}, expect='deny')
    update('updatedAt only', {'updatedAt': NOW + 5}, expect='allow')
    update('updatedAt future', {'updatedAt': NOW + HOUR + 60000}, expect='deny')
    update('updatedAt string', {'updatedAt': 'x'}, expect='deny')
    update('uid', {'uid': X_UID}, expect='deny')
    update('createdAt', {'createdAt': 1}, expect='deny')
    update('createdAt same', {'createdAt': w.plan_doc['createdAt']}, expect='allow')
    update('uid same', {'uid': w.uid}, expect='allow')
    update('extra key', {'note': 'x'}, expect='deny')
    update('keyId', {'keyId': 'k2'}, expect='allow')
    update('keyId null', {'keyId': None}, expect='allow')
    update('keyId number', {'keyId': 2}, expect='deny')
    update('remove keyId', {}, mask=['keyId'], expect='deny')
    update('remove stance', {}, mask=['stance'], expect='deny')
    update('remove uid', {}, mask=['uid'], expect='deny')
    update('remove createdAt', {}, mask=['createdAt'], expect='deny')
    update('remove updatedAt', {}, mask=['updatedAt'], expect='deny')
    update('remove sealed', {}, mask=['sealed'], expect='allow')
    update('remove startDate', {}, mask=['startDate'], expect='allow')
    update('remove dirtyFrom', {}, mask=['dirtyFrom'], expect='allow')
    update('remove trackingPeriods', {}, mask=['trackingPeriods'], expect='allow')
    for s in [None, TODAY, TODAY - 400 * DAY, 0]:
        update(f'startDate {s}', {'startDate': s}, expect='allow')
    update('startDate not midnight', {'startDate': TODAY + 5}, expect='deny')
    update('startDate string', {'startDate': 'x'}, expect='deny')
    update('startDate bool', {'startDate': True}, expect='deny')
    for v, exp in [(None, 'allow'), ('2026-05', 'allow'), ('2026-12', 'allow'), ('2026-01', 'allow'), ('2026-13', 'deny'), ('2026-00', 'deny'),
                   ('2026-5', 'deny'), ('x2026-05', 'deny'), ('2026-05-01', 'deny'), ('12026-05', 'deny'), ('', 'deny'), (202605, 'deny')]:
        update(f'dirtyFrom {v!r}', {'dirtyFrom': v}, expect=exp)
    P = lambda a, b=None: {'from': a, 'to': b}
    periods = [
        ('empty', [], 'allow'),
        ('one open', [P(TODAY)], 'allow'),
        ('one closed same day', [P(TODAY, TODAY)], 'allow'),
        ('one closed', [P(TODAY - DAY, TODAY)], 'allow'),
        ('closed to before from', [P(TODAY, TODAY - DAY)], 'deny'),
        ('from not midnight', [P(TODAY + 5)], 'deny'),
        ('to not midnight', [P(TODAY, TODAY + 5)], 'deny'),
        ('from string', [P('x')], 'deny'),
        ('from null', [P(None)], 'deny'),
        ('to string', [P(TODAY, 'x')], 'deny'),
        ('period extra key', [{'from': TODAY, 'to': None, 'x': 1}], 'deny'),
        ('period without to', [{'from': TODAY}], 'deny'),
        ('period without from', [{'to': TODAY}], 'deny'),
        ('period not a map', ['x'], 'deny'),
        ('two periods fine', [P(TODAY - 5 * DAY, TODAY - 3 * DAY), P(TODAY - DAY)], 'allow'),
        ('first period invalid, last fine', [P('x'), P(TODAY)], 'allow'),
        ('first period out of order', [P(TODAY + DAY, TODAY), P(TODAY)], 'allow'),
        ('last period invalid', [P(TODAY), P('x')], 'deny'),
        ('50 periods', [P(TODAY - DAY * (60 - i), None) for i in range(50)], 'allow'),
        ('51 periods', [P(TODAY - DAY * (60 - i), None) for i in range(51)], 'deny'),
        ('not a list', 'x', 'deny'),
        ('a map', {'from': TODAY}, 'deny'),
        ('null', None, 'deny'),
    ]
    for name, v, exp in periods:
        update(f'trackingPeriods {name}', {'trackingPeriods': v}, expect=exp)
    for name, value, exp in SEALED_VARIANTS:
        update(f'sealed {name}', {'sealed': value}, expect='allow' if name in ('ok', 'ok with ciphertext', 'null') else 'deny')
    update('sealed null then stance', {'sealed': None, 'stance': 'middle'}, expect='allow')
    # legacy plans written before the newer keys existed
    legacy = ('sealed', 'startDate', 'trackingPeriods', 'dirtyFrom')
    update('legacy stance', {'stance': 'middle', 'updatedAt': NOW}, legacy_drop=legacy, expect='allow')
    update('legacy updatedAt only', {'updatedAt': NOW}, legacy_drop=legacy, expect='allow')
    update('legacy add sealed', {'sealed': SEAL}, legacy_drop=legacy, expect='allow')
    update('legacy add startDate', {'startDate': TODAY}, legacy_drop=legacy, expect='allow')
    update('legacy add dirtyFrom', {'dirtyFrom': '2026-05'}, legacy_drop=legacy, expect='allow')
    update('legacy add trackingPeriods', {'trackingPeriods': [P(TODAY)]}, legacy_drop=legacy, expect='allow')
    update('legacy without keyId', {'stance': 'middle'}, legacy_drop=legacy + ('keyId',), expect='deny')
    update('legacy with keyId added', {'keyId': 'k'}, legacy_drop=legacy + ('keyId',), expect='allow')
    for a in 'oxa':
        run(f'plan delete [{a}]', w, a, [rm(w.base)], 'deny', pre=[put(w.base, w.plan_doc)])
    run('plan create over existing doc [o]', w, 'o', [put(w.base, create_doc())], None, pre=[put(w.base, w.plan_doc)])
    run('plan create other uid path [o]', w, 'o', [put(f'apps/runway/plans/{X_UID}', create_doc(uid=X_UID))], 'deny', pre=[rm(f'apps/runway/plans/{X_UID}')])
    run('plan create as other uid path [x]', w, 'x', [put(f'apps/runway/plans/{X_UID}', create_doc(uid=X_UID))], 'allow', pre=[rm(f'apps/runway/plans/{X_UID}')])
    run('plan create as other uid path with owner uid field [x]', w, 'x', [put(f'apps/runway/plans/{X_UID}', create_doc(uid=w.uid))], 'deny', pre=[rm(f'apps/runway/plans/{X_UID}')])
    run('plan update of owner as other [x] full doc', w, 'x', [put(w.base, w.plan_doc)], 'deny')


# ---------------------------------------------------------------------------------------------------------
# items
# ---------------------------------------------------------------------------------------------------------
def items():
    w = World('items')
    ib = lambda id: w.p('items/' + id)

    def create(label, doc, expect, actor='o', extra=()):
        run(f'item create {label} [{actor}]', w, actor, [put(ib(doc['id']) if 'id' in doc and isinstance(doc['id'], str) else ib(nid()), doc)] + list(extra), expect)

    base = lambda: item_doc(nid('it'))
    d = base(); triple('item create valid', w, [put(ib(d['id']), d)])
    for k in ITEM_KINDS: create(f'kind {k}', item_doc(nid('it'), k), 'allow')
    create('kind bogus', item_doc(nid('it'), 'bogus'), 'deny')
    create('kind number', item_doc(nid('it'), 1), 'deny')
    create('parentId string', item_doc(nid('it'), parentId='p'), 'allow')
    create('parentId number', item_doc(nid('it'), parentId=1), 'deny')
    create('createdAt future', item_doc(nid('it'), createdAt=NOW + HOUR + 60000), 'deny')
    create('createdAt near future', item_doc(nid('it'), createdAt=NOW + HOUR - 60000), 'allow')
    create('createdAt string', item_doc(nid('it'), createdAt='x'), 'deny')
    create('endedAt set', item_doc(nid('it'), endedAt=TODAY), 'deny')
    create('archivedAt set', item_doc(nid('it'), archivedAt=NOW), 'deny')
    for key in ['id', 'kind', 'parentId', 'createdAt', 'endedAt', 'archivedAt']:
        dd = without(item_doc(nid('it')), key); run(f'item create without {key} [o]', w, 'o', [put(ib(nid('it')), dd)], 'deny')
    dd = item_doc(nid('it'), extra=1); run('item create extra key [o]', w, 'o', [put(ib(dd['id']), dd)], 'deny')
    dd = item_doc('other'); run('item create id mismatch [o]', w, 'o', [put(ib('mismatch1'), dd)], 'deny')
    dd = item_doc(nid('it')); run('item create twice (second overwrites) [o]', w, 'o', [put(ib(dd['id']), dd)], 'allow', pre=[put(ib(dd['id']), dd)])

    # updates
    def seeded(**o):
        it = item_doc(nid('up'), **o); return it

    def upd(label, mod, actor='o', expect=None, extra_writes=(), item=None, pre_extra=(), mask=None, drop=(), omit=()):
        it = item or seeded()
        new = dict(without(it, *drop, *omit), **mod) if isinstance(mod, dict) else mod(it)
        run(f'item update {label} [{actor}]', w, actor,
            [put(ib(it['id']), new, mask)] + [x(it) if callable(x) else x for x in extra_writes], expect,
            pre=[put(ib(it['id']), without(it, *drop))] + list(pre_extra))

    ended_change = lambda it, **o: put(w.p('changes/ended_' + it['id']), change_doc('ended_' + it['id'], 'ended', **o))
    upd('no change', {}, expect='allow')
    upd('no change [x]', {}, actor='x', expect='deny')
    upd('no change [a]', {}, actor='a', expect='deny')
    upd('end with entry', {'endedAt': TODAY + 3 * DAY}, extra_writes=[lambda it: ended_change(it)], expect='allow')
    upd('end with entry [x]', {'endedAt': TODAY + 3 * DAY}, actor='x', extra_writes=[lambda it: ended_change(it)], expect='deny')
    upd('end with entry [a]', {'endedAt': TODAY + 3 * DAY}, actor='a', extra_writes=[lambda it: ended_change(it)], expect='deny')
    upd('end with entry in the past', {'endedAt': TODAY - 30 * DAY}, extra_writes=[lambda it: ended_change(it)], expect='allow')
    upd('end with entry far ahead', {'endedAt': TODAY + 3700 * DAY}, extra_writes=[lambda it: ended_change(it)], expect='deny')
    upd('end with entry 9 years ahead', {'endedAt': TODAY + 3300 * DAY}, extra_writes=[lambda it: ended_change(it)], expect='allow')
    upd('end not midnight', {'endedAt': TODAY + 5}, extra_writes=[lambda it: ended_change(it)], expect='deny')
    upd('end string', {'endedAt': 'x'}, extra_writes=[lambda it: ended_change(it)], expect='deny')
    upd('end null (no change)', {'endedAt': None}, extra_writes=[lambda it: ended_change(it)], expect='allow')
    upd('end without entry', {'endedAt': TODAY}, expect='deny')
    upd('end with entry of another id', {'endedAt': TODAY}, extra_writes=[lambda it: put(w.p('changes/ended_zz'), change_doc('ended_zz', 'ended'))], expect='deny')
    upd('end with planChange entry', {'endedAt': TODAY}, extra_writes=[lambda it: put(w.p('changes/ended_' + it['id']), change_doc('ended_' + it['id'], 'planChange'))], expect='deny')
    it = seeded(); upd('end with entry stored earlier', {'endedAt': TODAY}, item=it, pre_extra=[ended_change(it)], expect='allow')
    it = seeded(); upd('end with other-kind entry stored earlier', {'endedAt': TODAY}, item=it, pre_extra=[put(w.p('changes/ended_' + it['id']), change_doc('ended_' + it['id'], 'planChange'))], expect='deny')
    it = seeded(endedAt=TODAY); upd('second end same value', {'endedAt': TODAY}, item=it, expect='allow')
    it = seeded(endedAt=TODAY); upd('second end other value', {'endedAt': TODAY + DAY}, item=it, extra_writes=[lambda i: ended_change(i)], pre_extra=[], expect='deny')
    it = seeded(endedAt=TODAY); upd('end cleared', {'endedAt': None}, item=it, expect='deny')
    it = seeded(endedAt=TODAY); upd('end removed key', {}, item=it, omit=('endedAt',), mask=list(item_doc('z')), expect='deny')
    upd('archive', {'archivedAt': NOW}, expect='allow')
    upd('archive [x]', {'archivedAt': NOW}, actor='x', expect='deny')
    upd('archive [a]', {'archivedAt': NOW}, actor='a', expect='deny')
    upd('archive near future', {'archivedAt': NOW + HOUR - 60000}, expect='allow')
    upd('archive future', {'archivedAt': NOW + HOUR + 60000}, expect='deny')
    upd('archive string', {'archivedAt': 'x'}, expect='deny')
    upd('archive zero', {'archivedAt': 0}, expect='allow')
    it = seeded(archivedAt=NOW - 1000); upd('second archive same', {'archivedAt': NOW - 1000}, item=it, expect='allow')
    it = seeded(archivedAt=NOW - 1000); upd('second archive other', {'archivedAt': NOW}, item=it, expect='deny')
    it = seeded(archivedAt=NOW - 1000); upd('un-archive', {'archivedAt': None}, item=it, expect='deny')
    upd('end and archive', {'endedAt': TODAY, 'archivedAt': NOW}, extra_writes=[lambda it: ended_change(it)], expect='allow')
    upd('end and archive without entry', {'endedAt': TODAY, 'archivedAt': NOW}, expect='deny')
    upd('end ok archive bad', {'endedAt': TODAY, 'archivedAt': 'x'}, extra_writes=[lambda it: ended_change(it)], expect='deny')
    upd('kind', {'kind': 'goal'}, expect='deny')
    upd('parentId', {'parentId': 'p'}, expect='deny')
    upd('createdAt', {'createdAt': NOW - 5}, expect='deny')
    upd('id', {'id': 'other'}, expect='deny')
    upd('extra key', {'extra': 1}, expect='deny')
    it = seeded(parentId='p'); upd('parentId same', {'parentId': 'p'}, item=it, expect='allow')
    for key in ['id', 'kind', 'parentId', 'createdAt', 'archivedAt']:
        it = seeded(); upd(f'removed {key}', {}, item=it, omit=(key,), mask=list(item_doc('z')), expect=None)
    # legacy-shaped items written before endedAt / archivedAt / parentId existed
    for name, drop, mod, exp in [
        ('no endedAt/archivedAt, rewritten with nulls', ('endedAt', 'archivedAt'), {'endedAt': None, 'archivedAt': None}, 'allow'),
        ('no endedAt/archivedAt, archive', ('endedAt', 'archivedAt'), {'endedAt': None, 'archivedAt': NOW}, 'allow'),
        ('no endedAt/archivedAt, end', ('endedAt', 'archivedAt'), {'endedAt': TODAY, 'archivedAt': None}, 'allow'),
        ('no endedAt/archivedAt, end without entry', ('endedAt', 'archivedAt'), {'endedAt': TODAY, 'archivedAt': None}, 'deny'),
        ('no archivedAt, archive', ('archivedAt',), {'archivedAt': NOW}, 'allow'),
        ('no endedAt, end', ('endedAt',), {'endedAt': TODAY}, 'allow'),
        ('no parentId', ('parentId',), {'parentId': None}, 'deny'),
        ('no parentId, other change', ('parentId',), {'archivedAt': NOW}, 'deny'),
    ]:
        it = seeded()
        withentry = 'without entry' not in name and ('end' in name and 'archive' not in name or name.endswith('end'))
        run(f'item update legacy {name} [o]', w, 'o',
            [put(ib(it['id']), dict(without(it, *drop), **mod))] + ([ended_change(it)] if withentry else []), exp,
            pre=[put(ib(it['id']), without(it, *drop))])
    for a in 'oxa':
        it = seeded(); run(f'item delete [{a}]', w, a, [rm(ib(it['id']))], 'deny', pre=[put(ib(it['id']), it)])
        read(f'item read [{a}]', w, a, 'items/' + it['id'], 'allow' if a == 'o' else 'deny')
    it = without(seeded(), 'endedAt', 'archivedAt', 'parentId'); admin([put(ib(it['id']), it)])
    for a in 'oxa': read(f'item read legacy [{a}]', w, a, 'items/' + it['id'], 'allow' if a == 'o' else 'deny')


# ---------------------------------------------------------------------------------------------------------
# versions and changes
# ---------------------------------------------------------------------------------------------------------
def versions_changes():
    w = World('ver')
    vb = lambda id: w.p('versions/' + id)
    cb = lambda id: w.p('changes/' + id)
    ib = lambda id: w.p('items/' + id)

    def fixtures(kind='bill'):
        i = nid('vi'); c = nid('vc')
        return i, c, [put(ib(i), item_doc(i, kind)), put(cb(c), change_doc(c))]

    def ver(label, mk, expect, actor='o', batch=False, kind='bill'):
        i, c, pre = fixtures(kind)
        v = mk(i, c)
        if batch:
            run(f'version {label} [{actor}]', w, actor, [put(ib(i), item_doc(i, kind)), put(cb(c), change_doc(c)), put(vb(v['id']), v)], expect)
        else:
            run(f'version {label} [{actor}]', w, actor, [put(vb(v['id']), v)], expect, pre=pre)

    mk = lambda **o: (lambda i, c: version_doc(nid('v'), i, 'bill', c, **o))
    ver('create valid', mk(), 'allow')
    ver('create valid', mk(), 'deny', actor='x')
    ver('create valid', mk(), 'deny', actor='a')
    ver('create in one batch with item and change', mk(), 'allow', batch=True)
    ver('create in one batch [x]', mk(), 'deny', actor='x', batch=True)
    ver('create in one batch [a]', mk(), 'deny', actor='a', batch=True)
    for k in ITEM_KINDS: ver(f'kind {k}', lambda i, c, k=k: version_doc(nid('v'), i, k, c), 'allow', kind=k)
    ver('kind differs from the item', lambda i, c: version_doc(nid('v'), i, 'goal', c), 'deny')
    ver('kind bogus', lambda i, c: version_doc(nid('v'), i, 'bogus', c), 'deny')
    ver('kind number', lambda i, c: version_doc(nid('v'), i, 1, c), 'deny')
    ver('itemId missing item', lambda i, c: version_doc(nid('v'), 'ghost', 'bill', c), 'deny')
    ver('itemId number', lambda i, c: version_doc(nid('v'), 5, 'bill', c), 'deny')
    ver('changeId missing change', lambda i, c: version_doc(nid('v'), i, 'bill', 'ghost'), 'deny')
    ver('changeId number', lambda i, c: version_doc(nid('v'), i, 'bill', 5), 'deny')
    ver('changeId null', lambda i, c: version_doc(nid('v'), i, 'bill', None), 'deny')
    ver('createdAt future', mk(createdAt=NOW + HOUR + 60000), 'deny')
    ver('createdAt near', mk(createdAt=NOW + HOUR - 60000), 'allow')
    ver('createdAt string', mk(createdAt='x'), 'deny')
    for name, v, exp in [('past', TODAY - 400 * DAY, 'allow'), ('today', TODAY, 'allow'), ('9 years', TODAY + 3300 * DAY, 'allow'), ('11 years', TODAY + 4000 * DAY, 'deny'),
                         ('not midnight', TODAY + 5, 'deny'), ('string', 'x', 'deny'), ('null', None, 'deny'), ('bool', True, 'deny')]:
        ver(f'effectiveFrom {name}', mk(effectiveFrom=v), exp)
    F = TODAY + 40 * DAY
    for name, v, exp in [('null', None, 'allow'), ('after from', F + DAY, 'allow'), ('equal from', F, 'deny'), ('before from', F - DAY, 'deny'),
                         ('11 years', TODAY + 4000 * DAY, 'deny'), ('9 years', TODAY + 3300 * DAY, 'allow'), ('not midnight', F + DAY + 5, 'deny'), ('string', 'x', 'deny')]:
        ver(f'effectiveUntil {name}', mk(effectiveUntil=v), exp)
    for name, value, exp in SEALED_VARIANTS:
        ver(f'sealed {name}', mk(sealed=value), exp)
    ver('extra key', mk(extra=1), 'deny')
    for key in ['id', 'itemId', 'kind', 'createdAt', 'effectiveFrom', 'effectiveUntil', 'changeId', 'sealed']:
        i, c, pre = fixtures(); v = without(version_doc(nid('v'), i, 'bill', c), key)
        run(f'version without {key} [o]', w, 'o', [put(vb(v.get('id', nid('v'))), v)], 'deny', pre=pre)
    i, c, pre = fixtures(); v = version_doc('mismatch', i, 'bill', c); run('version id mismatch [o]', w, 'o', [put(vb('other'), v)], 'deny', pre=pre)
    i, c, pre = fixtures(); v = version_doc(nid('v'), i, 'bill', c)
    for a in 'oxa':
        run(f'version update [{a}]', w, a, [put(vb(v['id']), dict(v, createdAt=NOW - 5))], 'deny', pre=pre + [put(vb(v['id']), v)])
        run(f'version delete [{a}]', w, a, [rm(vb(v['id']))], 'deny')
        read(f'version read [{a}]', w, a, 'versions/' + v['id'], 'allow' if a == 'o' else 'deny')
    # legacy version without effectiveUntil key
    i, c, pre = fixtures(); v = without(version_doc(nid('v'), i, 'bill', c), 'effectiveUntil'); admin(pre + [put(vb(v['id']), v)])
    for a in 'oxa': read(f'version read legacy [{a}]', w, a, 'versions/' + v['id'], 'allow' if a == 'o' else 'deny')

    # changes
    def chg(label, mk, expect, actor='o'):
        c = mk(nid('c'))
        run(f'change {label} [{actor}]', w, actor, [put(cb(c['id']), c)], expect)

    cm = lambda **o: (lambda id: change_doc(id, **o))
    chg('create valid', cm(), 'allow'); chg('create valid', cm(), 'deny', 'x'); chg('create valid', cm(), 'deny', 'a')
    for k in CHANGE_KINDS: chg(f'kind {k}', cm(kind=k), 'allow')
    chg('kind bogus', cm(kind='bogus'), 'deny'); chg('kind number', cm(kind=1), 'deny')
    chg('createdAt future', cm(createdAt=NOW + HOUR + 60000), 'deny'); chg('createdAt near', cm(createdAt=NOW + HOUR - 60000), 'allow')
    chg('createdAt string', cm(createdAt='x'), 'deny')
    for name, v, exp in [('null', None, 'allow'), ('past', TODAY - 40 * DAY, 'allow'), ('9 years', TODAY + 3300 * DAY, 'allow'), ('11 years', TODAY + 4000 * DAY, 'deny'),
                         ('not midnight', TODAY + 5, 'deny'), ('string', 'x', 'deny')]:
        chg(f'effectiveFrom {name}', cm(effectiveFrom=v), exp)
    chg('itemIds empty', cm(itemIds=[]), 'allow'); chg('itemIds 20', cm(itemIds=['a'] * 20), 'allow'); chg('itemIds 21', cm(itemIds=['a'] * 21), 'deny')
    chg('itemIds not list', cm(itemIds='a'), 'deny'); chg('itemIds null', cm(itemIds=None), 'deny'); chg('itemIds numbers', cm(itemIds=[1, 2]), 'allow')
    for name, value, exp in SEALED_VARIANTS: chg(f'sealed {name}', cm(sealed=value), exp)
    chg('extra key', cm(extra=1), 'deny')
    for key in ['id', 'kind', 'createdAt', 'effectiveFrom', 'itemIds', 'sealed']:
        c = without(change_doc(nid('c')), key); run(f'change without {key} [o]', w, 'o', [put(cb(nid('c')), c)], 'deny')
    run('change id mismatch [o]', w, 'o', [put(cb('mm1'), change_doc('mm2'))], 'deny')
    c = change_doc(nid('c'))
    for a in 'oxa':
        run(f'change update [{a}]', w, a, [put(cb(c['id']), dict(c, createdAt=NOW - 5))], 'deny', pre=[put(cb(c['id']), c)])
        run(f'change delete [{a}]', w, a, [rm(cb(c['id']))], 'deny')
        read(f'change read [{a}]', w, a, 'changes/' + c['id'], 'allow' if a == 'o' else 'deny')


# ---------------------------------------------------------------------------------------------------------
# days and records
# ---------------------------------------------------------------------------------------------------------
def days_records():
    w = World('day')
    ON = TODAY - 5 * DAY
    D_ = lambda pl, on=ON: f'{pl}_{stamp(on)}'
    db = lambda id: w.p('days/' + id)
    rb = lambda day, rid: w.p(f'days/{day}/records/{rid}')

    def day(pl, status='draft', on=ON, **o):
        id = D_(pl, on)
        d = dict(id=id, payLineId=pl, sourceId=None, expectedOn=on, arrivedOn=None, status=status, createdAt=NOW, confirmedAt=None, doneLineIds=[], sealed=SEAL)
        if status == 'confirmed': d.update(arrivedOn=on, confirmedAt=NOW - 1000)
        d.update(o); return d

    def rec(day_id, kind, **o):
        d = dict(id=f'{day_id}_{kind}', dayId=day_id, kind=kind, createdAt=NOW, sealed=SEAL)
        d.update(o); return d

    def records(d, kinds=('proposed', 'confirmed'), **o):
        return [put(rb(d['id'], f"{d['id']}_{k}"), rec(d['id'], k, **o)) for k in kinds]

    def seed(status='draft', **o):
        d = day(nid('p'), status, **o)
        pre = [put(db(d['id']), d)] + (records(d) if status == 'confirmed' else [])
        return d, pre

    # create
    def create(label, d, expect, actor='o', recs=None):
        run(f'day create {label} [{actor}]', w, actor, [put(db(d['id']), d)] + (records(d) if recs is None and d.get('status') == 'confirmed' else (recs or [])), expect)

    create('draft', day(nid('c')), 'allow'); create('draft', day(nid('c')), 'deny', 'x'); create('draft', day(nid('c')), 'deny', 'a')
    create('notArrived', day(nid('c'), 'notArrived'), 'allow')
    create('confirmed with both records', day(nid('c'), 'confirmed'), 'allow')
    create('confirmed with both records', day(nid('c'), 'confirmed'), 'deny', 'x')
    create('confirmed with both records', day(nid('c'), 'confirmed'), 'deny', 'a')
    create('confirmed without records', day(nid('c'), 'confirmed'), 'deny', recs=[])
    d = day(nid('c'), 'confirmed'); create('confirmed with proposed only', d, 'deny', recs=records(d, ('proposed',)))
    d = day(nid('c'), 'confirmed'); create('confirmed with confirmed only', d, 'deny', recs=records(d, ('confirmed',)))
    create('confirmed arrivedOn null', day(nid('c'), 'confirmed', arrivedOn=None), 'deny')
    create('confirmed arrivedOn not midnight', day(nid('c'), 'confirmed', arrivedOn=ON + 5), 'deny')
    create('confirmed confirmedAt null', day(nid('c'), 'confirmed', confirmedAt=None), 'deny')
    create('confirmed confirmedAt future', day(nid('c'), 'confirmed', confirmedAt=NOW + HOUR + 60000), 'deny')
    create('draft with arrivedOn', day(nid('c'), arrivedOn=ON), 'deny')
    create('draft with confirmedAt', day(nid('c'), confirmedAt=NOW), 'deny')
    create('notArrived with arrivedOn', day(nid('c'), 'notArrived', arrivedOn=ON), 'deny')
    create('notArrived with confirmedAt', day(nid('c'), 'notArrived', confirmedAt=NOW), 'deny')
    create('status bogus', day(nid('c'), 'bogus'), 'deny')
    create('status number', day(nid('c'), 1), 'deny')
    create('sourceId string', day(nid('c'), sourceId='s'), 'allow'); create('sourceId number', day(nid('c'), sourceId=1), 'deny')
    d = day(nid('c')); create('spoofed id', dict(d, id='spoof'), 'deny')
    d = day(nid('c')); run('day create id differs from doc id [o]', w, 'o', [put(db('different'), d)], 'deny')
    d = day(nid('c')); run('day create id date differs [o]', w, 'o', [put(db(D_(d['payLineId'], ON + DAY)), dict(d, id=D_(d['payLineId'], ON + DAY)))], 'deny')
    pl = nid('c'); create('expectedOn mid-day (same date)', day(pl, on=ON, expectedOn=ON + 5 * HOUR), 'allow')
    create('expectedOn string', day(nid('c'), expectedOn='x'), 'deny')
    create('payLineId number', day(nid('c'), payLineId=1), 'deny')
    create('createdAt future', day(nid('c'), createdAt=NOW + HOUR + 60000), 'deny'); create('createdAt string', day(nid('c'), createdAt='x'), 'deny')
    create('doneLineIds 200', day(nid('c'), doneLineIds=['a'] * 200), 'allow'); create('doneLineIds 201', day(nid('c'), doneLineIds=['a'] * 201), 'deny')
    create('doneLineIds not list', day(nid('c'), doneLineIds='a'), 'deny'); create('doneLineIds null', day(nid('c'), doneLineIds=None), 'deny')
    for name, value, exp in SEALED_VARIANTS: create(f'sealed {name}', day(nid('c'), sealed=value), exp)
    create('extra key', day(nid('c'), extra=1), 'deny')
    for key in ['id', 'payLineId', 'sourceId', 'expectedOn', 'arrivedOn', 'status', 'createdAt', 'confirmedAt', 'doneLineIds', 'sealed']:
        d = day(nid('c')); run(f'day create without {key} [o]', w, 'o', [put(db(d['id']), without(d, key))], 'deny')
    d = day(nid('c')); run('day create twice [o]', w, 'o', [put(db(d['id']), d)], None, pre=[put(db(d['id']), d)])
    d = day(nid('c')); run('day create confirmed twice, records exist [o]', w, 'o', [put(db(d['id']), dict(d, status='confirmed', arrivedOn=ON, confirmedAt=NOW))] + records(d), 'deny', pre=[put(db(d['id']), dict(d, status='confirmed', arrivedOn=ON, confirmedAt=NOW))] + records(d))

    # updates
    def conf(d, recs=('proposed', 'confirmed'), ts=NOW, arr=ON, **o):
        return [put(db(d['id']), dict(d, status='confirmed', arrivedOn=arr, confirmedAt=ts, **o), ['status', 'arrivedOn', 'confirmedAt'] + list(o))] + records(d, recs)

    def upd(label, status, mk, expect, actor='o', **kw):
        d, pre = seed(status, **kw)
        run(f'day update {label} [{actor}]', w, actor, mk(d), expect, pre=pre)

    sl = lambda d, **o: [put(db(d['id']), dict(d, **o), list(o))]
    upd('draft confirm', 'draft', conf, 'allow')
    upd('draft confirm', 'draft', conf, 'deny', 'x')
    upd('draft confirm', 'draft', conf, 'deny', 'a')
    upd('draft confirm no records', 'draft', lambda d: conf(d, ()), 'deny')
    upd('draft confirm proposed only', 'draft', lambda d: conf(d, ('proposed',)), 'deny')
    upd('draft confirm confirmed only', 'draft', lambda d: conf(d, ('confirmed',)), 'deny')
    upd('draft confirm arrivedOn not midnight', 'draft', lambda d: conf(d, arr=ON + 5), 'deny')
    upd('draft confirm arrivedOn null', 'draft', lambda d: conf(d, arr=None), 'deny')
    upd('draft confirm confirmedAt future', 'draft', lambda d: conf(d, ts=NOW + HOUR + 60000), 'deny')
    upd('draft confirm confirmedAt near', 'draft', lambda d: conf(d, ts=NOW + HOUR - 60000), 'allow')
    upd('draft confirm confirmedAt null', 'draft', lambda d: conf(d, ts=None), 'deny')
    upd('draft confirm and sealed', 'draft', lambda d: conf(d, sealed=dict(SEAL, value='y')), 'deny')
    upd('draft confirm and expectedOn', 'draft', lambda d: conf(d, expectedOn=ON + DAY), 'deny')
    upd('draft confirm and doneLineIds', 'draft', lambda d: conf(d, doneLineIds=['a']), 'deny')
    upd('draft confirm arrivedOn string', 'draft', lambda d: conf(d, arr='x'), 'deny')
    upd('draft confirm record wrong id', 'draft', lambda d: conf(d, ())[:1] + [put(rb(d['id'], 'x'), rec(d['id'], 'proposed', id='x'))], 'deny')
    upd('draft confirm record dayId mismatch', 'draft', lambda d: conf(d, ()) + [put(rb(d['id'], d['id'] + '_proposed'), rec(d['id'], 'proposed', dayId='zz')), put(rb(d['id'], d['id'] + '_confirmed'), rec(d['id'], 'confirmed'))], 'deny')
    upd('draft confirm record createdAt future', 'draft', lambda d: conf(d, ()) + records(d, createdAt=NOW + HOUR + 60000), 'deny')
    upd('draft confirm record extra key', 'draft', lambda d: conf(d, ()) + records(d, extra=1), 'deny')
    upd('draft confirm record sealed bad', 'draft', lambda d: conf(d, ()) + records(d, sealed={'value': 'x'}), 'deny')
    upd('draft confirm record kind correction', 'draft', lambda d: conf(d, ()) + [put(rb(d['id'], d['id'] + '_correction'), rec(d['id'], 'correction'))] + records(d, ('proposed',)), 'deny')
    upd('draft confirm record supersedesId null', 'draft', lambda d: conf(d, ()) + records(d, supersedesId=None), 'allow')
    upd('draft confirm record supersedesId string', 'draft', lambda d: conf(d, ()) + records(d, supersedesId='x'), 'deny')
    upd('draft sealed', 'draft', lambda d: sl(d, sealed=dict(SEAL, value='y')), 'allow')
    upd('draft sealed', 'draft', lambda d: sl(d, sealed=dict(SEAL, value='y')), 'deny', 'x')
    upd('draft sealed', 'draft', lambda d: sl(d, sealed=dict(SEAL, value='y')), 'deny', 'a')
    for name, value, exp in SEALED_VARIANTS:
        upd(f'draft sealed {name}', 'draft', lambda d, value=value: sl(d, sealed=value), 'allow' if exp == 'allow' else 'deny')
    upd('draft sealed and doneLineIds', 'draft', lambda d: sl(d, sealed=dict(SEAL, value='y'), doneLineIds=['a']), 'deny')
    upd('draft doneLineIds', 'draft', lambda d: sl(d, doneLineIds=['a']), 'deny')
    upd('draft expectedOn', 'draft', lambda d: sl(d, expectedOn=ON + DAY), 'deny')
    upd('draft status to notArrived', 'draft', lambda d: sl(d, status='notArrived'), 'allow')
    upd('draft status to notArrived', 'draft', lambda d: sl(d, status='notArrived'), 'deny', 'x')
    upd('draft status to notArrived', 'draft', lambda d: sl(d, status='notArrived'), 'deny', 'a')
    upd('draft status to notArrived with arrivedOn', 'draft', lambda d: sl(d, status='notArrived', arrivedOn=ON), 'deny')
    upd('draft status to notArrived with sealed', 'draft', lambda d: sl(d, status='notArrived', sealed=dict(SEAL, value='y')), 'deny')
    upd('draft status to bogus', 'draft', lambda d: sl(d, status='bogus'), 'deny')
    upd('draft status to confirmed alone', 'draft', lambda d: sl(d, status='confirmed'), 'deny')
    upd('draft status to draft', 'draft', lambda d: sl(d, status='draft'), 'allow')
    upd('draft no-op', 'draft', lambda d: sl(d), 'allow')
    upd('draft extra key', 'draft', lambda d: sl(d, extra=1), 'deny')
    upd('notArrived to draft', 'notArrived', lambda d: sl(d, status='draft'), 'allow')
    upd('notArrived to draft', 'notArrived', lambda d: sl(d, status='draft'), 'deny', 'x')
    upd('notArrived to draft', 'notArrived', lambda d: sl(d, status='draft'), 'deny', 'a')
    upd('notArrived to confirmed', 'notArrived', conf, 'deny')
    upd('notArrived sealed', 'notArrived', lambda d: sl(d, sealed=dict(SEAL, value='q')), 'deny')
    upd('notArrived doneLineIds', 'notArrived', lambda d: sl(d, doneLineIds=['a']), 'deny')
    upd('notArrived to bogus', 'notArrived', lambda d: sl(d, status='bogus'), 'deny')
    upd('notArrived to notArrived', 'notArrived', lambda d: sl(d, status='notArrived'), 'deny')
    upd('confirmed doneLineIds', 'confirmed', lambda d: sl(d, doneLineIds=['a']), 'allow')
    upd('confirmed doneLineIds', 'confirmed', lambda d: sl(d, doneLineIds=['a']), 'deny', 'x')
    upd('confirmed doneLineIds', 'confirmed', lambda d: sl(d, doneLineIds=['a']), 'deny', 'a')
    upd('confirmed doneLineIds 200', 'confirmed', lambda d: sl(d, doneLineIds=['a'] * 200), 'allow')
    upd('confirmed doneLineIds 201', 'confirmed', lambda d: sl(d, doneLineIds=['a'] * 201), 'deny')
    upd('confirmed doneLineIds string', 'confirmed', lambda d: sl(d, doneLineIds='a'), 'deny')
    upd('confirmed doneLineIds null', 'confirmed', lambda d: sl(d, doneLineIds=None), 'deny')
    upd('confirmed doneLineIds and sealed', 'confirmed', lambda d: sl(d, doneLineIds=['a'], sealed=dict(SEAL, value='z')), 'deny')
    upd('confirmed sealed', 'confirmed', lambda d: sl(d, sealed=dict(SEAL, value='y')), 'deny')
    upd('confirmed arrivedOn', 'confirmed', lambda d: sl(d, arrivedOn=ON + DAY), 'deny')
    upd('confirmed status to draft', 'confirmed', lambda d: sl(d, status='draft'), 'deny')
    upd('confirmed status to notArrived', 'confirmed', lambda d: sl(d, status='notArrived'), 'deny')
    upd('confirmed no-op', 'confirmed', lambda d: sl(d), 'allow')
    upd('confirmed confirm again', 'confirmed', conf, 'deny')
    # legacy confirmed day without doneLineIds, and draft days without arrivedOn/confirmedAt
    d = day(nid('lg'), 'confirmed'); run('day update legacy confirmed (no doneLineIds) tick [o]', w, 'o', sl(d, doneLineIds=['a']), 'allow', pre=[put(db(d['id']), without(d, 'doneLineIds'))] + records(d))
    d = day(nid('lg'), 'confirmed'); run('day update legacy confirmed (no doneLineIds) sealed [o]', w, 'o', sl(d, sealed=dict(SEAL, value='y')), 'deny', pre=[put(db(d['id']), without(d, 'doneLineIds'))] + records(d))
    d = day(nid('lg')); lg = without(d, 'arrivedOn', 'confirmedAt')
    run('day update legacy draft (no arrivedOn/confirmedAt) sealed [o]', w, 'o', [put(db(d['id']), dict(lg, sealed=dict(SEAL, value='y')), ['sealed'])], 'allow', pre=[put(db(d['id']), lg)])
    d = day(nid('lg')); lg = without(d, 'arrivedOn', 'confirmedAt')
    run('day update legacy draft confirm [o]', w, 'o', conf(d), 'allow', pre=[put(db(d['id']), lg)])
    d = day(nid('lg')); lg = without(d, 'arrivedOn', 'confirmedAt')
    run('day update legacy draft notArrived [o]', w, 'o', [put(db(d['id']), dict(lg, status='notArrived'), ['status'])], 'allow', pre=[put(db(d['id']), lg)])
    d = day(nid('lg')); lg = without(d, 'doneLineIds')
    run('day update legacy draft without doneLineIds sealed [o]', w, 'o', [put(db(d['id']), dict(lg, sealed=dict(SEAL, value='y')), ['sealed'])], 'allow', pre=[put(db(d['id']), lg)])
    for a in 'oxa':
        d, pre = seed('draft'); run(f'day delete draft [{a}]', w, a, [rm(db(d['id']))], 'deny', pre=pre)
        d, pre = seed('confirmed'); run(f'day delete confirmed [{a}]', w, a, [rm(db(d['id']))], 'deny', pre=pre)
        read(f'day read [{a}]', w, a, 'days/' + d['id'], 'allow' if a == 'o' else 'deny')
        read(f'record read [{a}]', w, a, f"days/{d['id']}/records/{d['id']}_confirmed", 'allow' if a == 'o' else 'deny')
        run(f'record update [{a}]', w, a, [put(rb(d['id'], d['id'] + '_confirmed'), rec(d['id'], 'confirmed', createdAt=NOW - 4))], 'deny')
        run(f'record recreate [{a}]', w, a, [put(rb(d['id'], d['id'] + '_confirmed'), rec(d['id'], 'confirmed'))], 'deny')
        run(f'record delete [{a}]', w, a, [rm(rb(d['id'], d['id'] + '_confirmed'))], 'deny')

    # records alone
    d, pre = seed('draft'); run('record only, day stays draft [o]', w, 'o', records(d), 'deny', pre=pre)
    d, pre = seed('notArrived'); run('record on notArrived day [o]', w, 'o', records(d), 'deny', pre=pre)
    run('record on a missing day [o]', w, 'o', [put(rb('nope_20261101', 'nope_20261101_proposed'), rec('nope_20261101', 'proposed'))], 'deny')
    d, pre = seed('confirmed'); run('first record on a confirmed day again [o]', w, 'o', [put(rb(d['id'], d['id'] + '_proposed'), rec(d['id'], 'proposed'))], None, pre=pre)
    d, pre = seed('confirmed'); run('new first record kind on confirmed day [o]', w, 'o', [put(rb(d['id'], d['id'] + '_other'), rec(d['id'], 'proposed', id=d['id'] + '_other'))], 'deny', pre=pre)
    # records created with the day in a batch: field shapes
    def rbatch(label, mk, expect, actor='o'):
        d = day(nid('rb'), 'confirmed')
        run(f'record create {label} [{actor}]', w, actor, [put(db(d['id']), d)] + mk(d), expect)
    rbatch('both', lambda d: records(d), 'allow'); rbatch('both', lambda d: records(d), 'deny', 'x'); rbatch('both', lambda d: records(d), 'deny', 'a')
    rbatch('kind bogus', lambda d: records(d, ('proposed', 'confirmed'))[:1] + [put(rb(d['id'], d['id'] + '_bogus'), rec(d['id'], 'bogus'))], 'deny')
    rbatch('kind number', lambda d: records(d)[:1] + [put(rb(d['id'], d['id'] + '_1'), rec(d['id'], 1))], 'deny')
    rbatch('supersedesId null', lambda d: records(d, supersedesId=None), 'allow')
    rbatch('supersedesId string', lambda d: records(d, supersedesId='x'), 'deny')
    rbatch('id mismatch', lambda d: records(d)[:1] + [put(rb(d['id'], d['id'] + '_confirmed'), rec(d['id'], 'confirmed', id='zz'))], 'deny')
    rbatch('dayId mismatch', lambda d: records(d, dayId='zz'), 'deny')
    rbatch('createdAt future', lambda d: records(d, createdAt=NOW + HOUR + 60000), 'deny')
    rbatch('createdAt near', lambda d: records(d, createdAt=NOW + HOUR - 60000), 'allow')
    rbatch('createdAt string', lambda d: records(d, createdAt='x'), 'deny')
    for name, value, exp in SEALED_VARIANTS: rbatch(f'sealed {name}', lambda d, value=value: records(d, sealed=value), exp)
    rbatch('extra key', lambda d: records(d, extra=1), 'deny')
    for key in ['id', 'dayId', 'kind', 'createdAt', 'sealed']:
        rbatch(f'without {key}', lambda d, key=key: records(d)[:1] + [put(rb(d['id'], d['id'] + '_confirmed'), without(rec(d['id'], 'confirmed'), key))], 'deny')

    # corrections
    def cday(legacy=False):
        d, pre = seed('confirmed')
        if legacy: pre = pre + [put(rb(d['id'], d['id'] + '_confirmed'), without(rec(d['id'], 'confirmed'), 'supersedesId'))]
        return d, pre

    def corr(label, mk, expect, actor='o', pre_more=(), status='confirmed', legacy=False):
        d, pre = cday(legacy) if status == 'confirmed' else seed(status)
        c = mk(d)
        run(f'correction {label} [{actor}]', w, actor, [put(rb(d['id'], c.get('id', d['id'] + '_confirmed_corrected')), c)], expect, pre=pre + [x(d) for x in pre_more])

    C = lambda d, sup=None, **o: dict(id=(sup or d['id'] + '_confirmed') + '_corrected', dayId=d['id'], kind='correction', createdAt=NOW, sealed=SEAL, supersedesId=sup or d['id'] + '_confirmed', **o)
    corr('valid', lambda d: C(d), 'allow'); corr('valid', lambda d: C(d), 'deny', 'x'); corr('valid', lambda d: C(d), 'deny', 'a')
    corr('valid on legacy-shaped record', lambda d: C(d), 'allow', legacy=True)
    corr('of proposed record', lambda d: C(d, d['id'] + '_proposed'), 'deny')
    corr('of missing record', lambda d: C(d, 'ghost'), 'deny')
    corr('wrong id', lambda d: dict(C(d), id='anything'), 'deny')
    corr('without supersedesId', lambda d: without(C(d), 'supersedesId'), 'deny')
    corr('supersedesId null', lambda d: dict(C(d), supersedesId=None), 'deny')
    corr('supersedesId number', lambda d: dict(C(d), supersedesId=5), 'deny')
    corr('extra key', lambda d: C(d, extra=1), 'deny')
    corr('createdAt future', lambda d: dict(C(d), createdAt=NOW + HOUR + 60000), 'deny')
    corr('dayId mismatch', lambda d: dict(C(d), dayId='zz'), 'deny')
    corr('id field mismatch with doc', lambda d: dict(C(d), id='other_corrected'), 'deny')
    for name, value, exp in SEALED_VARIANTS: corr(f'sealed {name}', lambda d, value=value: dict(C(d), sealed=value), exp)
    for key in ['id', 'dayId', 'createdAt', 'sealed', 'kind']:
        corr(f'without {key}', lambda d, key=key: without(C(d), key) if key != 'id' else dict(without(C(d), 'id')), 'deny')
    corr('on a draft day', lambda d: dict(C(d, d['id'] + '_confirmed')), 'deny', status='draft')
    corr('on a notArrived day', lambda d: dict(C(d, d['id'] + '_confirmed')), 'deny', status='notArrived')
    corr('second correction of the same record', lambda d: C(d), 'deny', pre_more=[lambda d: put(rb(d['id'], d['id'] + '_confirmed_corrected'), C(d))])
    corr('chain: correction of a correction', lambda d: C(d, d['id'] + '_confirmed_corrected'), 'allow', pre_more=[lambda d: put(rb(d['id'], d['id'] + '_confirmed_corrected'), C(d))])
    corr('chain: correction of a proposed-kind record named like a correction', lambda d: C(d, d['id'] + '_proposed_corrected'), 'deny',
         pre_more=[lambda d: put(rb(d['id'], d['id'] + '_proposed_corrected'), rec(d['id'], 'proposed', id=d['id'] + '_proposed_corrected'))])
    corr('of record with kind number', lambda d: C(d, 'weird'), 'deny', pre_more=[lambda d: put(rb(d['id'], 'weird'), rec(d['id'], 1, id='weird'))])
    corr('of record without kind key', lambda d: C(d, 'weird'), 'deny', pre_more=[lambda d: put(rb(d['id'], 'weird'), without(rec(d['id'], 'x', id='weird'), 'kind'))])
    d, pre = cday(); c = C(d)
    run('correction via batch with day untouched [o]', w, 'o', [put(rb(d['id'], c['id']), c), put(db(d['id']), d, ['doneLineIds'])], 'allow', pre=pre)
    for a in 'oxa':
        read(f'correction read [{a}]', w, a, f"days/{d['id']}/records/{d['id']}_confirmed_corrected", None)
    d, pre = cday(); admin(pre + [put(rb(d['id'], d['id'] + '_confirmed_corrected'), C(d))])
    for a in 'oxa':
        read(f'correction read stored [{a}]', w, a, f"days/{d['id']}/records/{d['id']}_confirmed_corrected", 'allow' if a == 'o' else 'deny')
        run(f'correction update stored [{a}]', w, a, [put(rb(d['id'], d['id'] + '_confirmed_corrected'), C(d), ['createdAt'])], 'deny')
        run(f'correction delete stored [{a}]', w, a, [rm(rb(d['id'], d['id'] + '_confirmed_corrected'))], 'deny')


# ---------------------------------------------------------------------------------------------------------
# purchases and closings
# ---------------------------------------------------------------------------------------------------------
def purchases_closings():
    w = World('pur')
    pb = lambda id: w.p('purchases/' + id)
    cl = lambda m: w.p('closings/' + m)

    def pur(id, **o):
        d = dict(id=id, date=TODAY - 20 * DAY, source='manual', needsHome=False, createdAt=NOW, updatedAt=NOW, sealed=SEAL)
        d.update(o); return d

    def create(label, mk, expect, actor='o', world=None):
        ww = world or w
        d = mk(nid('pu'))
        run(f'purchase create {label} [{actor}]', ww, actor, [put(ww.p('purchases/' + d['id']), d)], expect)

    mk = lambda **o: (lambda id: pur(id, **o))
    create('valid', mk(), 'allow'); create('valid', mk(), 'deny', 'x'); create('valid', mk(), 'deny', 'a')
    for name, v, exp in [('before first period', TODAY - 70 * DAY, 'deny'), ('first period start', TODAY - 60 * DAY, 'allow'), ('one before first start', TODAY - 61 * DAY, 'deny'),
                         ('in a gap between periods', TODAY - 35 * DAY, 'allow'), ('in the first period', TODAY - 50 * DAY, 'allow'), ('today', TODAY, 'allow'),
                         ('tomorrow', TODAY + DAY, 'allow'), ('two days ahead', TODAY + 2 * DAY, 'deny'), ('not midnight', TODAY - 20 * DAY + 5, 'deny'), ('string', 'x', 'deny'),
                         ('null', None, 'deny'), ('open period start', TODAY - 30 * DAY, 'allow')]:
        create(f'date {name}', mk(date=v), exp)
    for s, exp in [('manual', 'allow'), ('csv', 'allow'), ('link', 'allow'), ('bank', 'deny'), (1, 'deny'), (None, 'deny')]:
        create(f'source {s!r}', mk(source=s), exp)
    create('needsHome true', mk(needsHome=True), 'allow'); create('needsHome string', mk(needsHome='x'), 'deny'); create('needsHome null', mk(needsHome=None), 'deny')
    create('createdAt future', mk(createdAt=NOW + HOUR + 60000), 'deny'); create('createdAt near', mk(createdAt=NOW + HOUR - 60000), 'allow')
    create('updatedAt future', mk(updatedAt=NOW + HOUR + 60000), 'deny'); create('updatedAt string', mk(updatedAt='x'), 'deny')
    for name, value, exp in SEALED_VARIANTS: create(f'sealed {name}', mk(sealed=value), exp)
    create('extra key', mk(extra=1), 'deny')
    for key in ['id', 'date', 'source', 'needsHome', 'createdAt', 'updatedAt', 'sealed']:
        d = without(pur(nid('pu')), key); run(f'purchase create without {key} [o]', w, 'o', [put(pb(nid('pu')), d)], 'deny')
    run('purchase create id mismatch [o]', w, 'o', [put(pb('mm1'), pur('mm2'))], 'deny')
    # plan variants
    closed = World('purc', trackingPeriods=[{'from': TODAY - 60 * DAY, 'to': TODAY - 40 * DAY}])
    for name, v, exp in [('inside', TODAY - 50 * DAY, 'allow'), ('on the last day', TODAY - 40 * DAY, 'allow'), ('after last day', TODAY - 39 * DAY, 'deny'), ('today', TODAY, 'deny')]:
        create(f'closed plan date {name}', mk(date=v), exp, world=closed)
    none = World('purn', trackingPeriods=[])
    create('no periods', mk(), 'deny', world=none)
    nokey = World('purk'); admin([put(nokey.base, without(nokey.plan_doc, 'trackingPeriods'))])
    create('plan without trackingPeriods key', mk(), 'deny', world=nokey)
    noplan = World('purx', plan=False)
    create('no plan document', mk(), 'deny', world=noplan)
    odd = World('puro', trackingPeriods=[{'from': TODAY - 10 * DAY, 'to': None}, {'from': TODAY - 60 * DAY, 'to': TODAY - 50 * DAY}])
    create('last period earlier than first', mk(date=TODAY - 55 * DAY), 'deny', world=odd)
    create('last period earlier than first, date after', mk(date=TODAY - 5 * DAY), 'deny', world=odd)
    create('last period earlier than first, date before first', mk(date=TODAY - 70 * DAY), 'deny', world=odd)
    create('last period earlier than first, date between', mk(date=TODAY - 20 * DAY), 'deny', world=odd)
    # updates
    def upd(label, mod, expect, actor='o', drop=(), mask=None, base=None):
        d = pur(nid('pe'), updatedAt=NOW - 5000, **(base or {}))
        new = dict(without(d, *drop), **mod)
        run(f'purchase update {label} [{actor}]', w, actor, [put(pb(d['id']), new, mask if mask is not None else list(mod))], expect, pre=[put(pb(d['id']), d)])

    upd('date and updatedAt', {'date': TODAY - 19 * DAY, 'updatedAt': NOW}, 'allow')
    upd('date and updatedAt', {'date': TODAY - 19 * DAY, 'updatedAt': NOW}, 'deny', 'x')
    upd('date and updatedAt', {'date': TODAY - 19 * DAY, 'updatedAt': NOW}, 'deny', 'a')
    upd('date outside tracking', {'date': TODAY - 70 * DAY, 'updatedAt': NOW}, 'deny')
    upd('date in the future', {'date': TODAY + 5 * DAY, 'updatedAt': NOW}, 'deny')
    upd('date not midnight', {'date': TODAY - 19 * DAY + 5, 'updatedAt': NOW}, 'deny')
    upd('date without updatedAt', {'date': TODAY - 19 * DAY}, 'deny')
    upd('updatedAt same', {'updatedAt': NOW - 5000}, 'deny')
    upd('updatedAt older', {'updatedAt': NOW - 9000}, 'deny')
    upd('updatedAt newer', {'updatedAt': NOW}, 'allow')
    upd('updatedAt future', {'updatedAt': NOW + HOUR + 60000}, 'deny')
    upd('updatedAt string', {'updatedAt': 'x'}, 'deny')
    for name, value, exp in SEALED_VARIANTS:
        upd(f'sealed {name}', {'sealed': value, 'updatedAt': NOW}, exp)
    upd('sealed and date', {'sealed': dict(SEAL, value='z'), 'date': TODAY - 18 * DAY, 'updatedAt': NOW}, 'allow')
    upd('source', {'source': 'csv', 'updatedAt': NOW}, 'deny')
    upd('needsHome', {'needsHome': True, 'updatedAt': NOW}, 'deny')
    upd('createdAt', {'createdAt': NOW - 99, 'updatedAt': NOW}, 'deny')
    upd('id', {'id': 'zz', 'updatedAt': NOW}, 'deny')
    upd('extra key', {'extra': 1, 'updatedAt': NOW}, 'deny')
    upd('remove needsHome', {'updatedAt': NOW}, 'deny', drop=('needsHome',), mask=['needsHome', 'updatedAt'])
    upd('remove sealed', {'updatedAt': NOW}, 'deny', drop=('sealed',), mask=['sealed', 'updatedAt'])
    upd('remove date', {'updatedAt': NOW}, 'deny', drop=('date',), mask=['date', 'updatedAt'])
    upd('source same', {'source': 'manual', 'updatedAt': NOW}, 'allow')
    upd('createdAt same', {'createdAt': NOW, 'updatedAt': NOW}, 'allow')
    upd('updatedAt older than request but an old purchase date', {'updatedAt': NOW}, 'deny', base={'date': TODAY - 70 * DAY})
    d = pur(nid('pe'), updatedAt=NOW - 5000); lg = without(d, 'updatedAt')
    run('purchase update legacy without updatedAt [o]', w, 'o', [put(pb(d['id']), dict(lg, updatedAt=NOW), ['updatedAt'])], None, pre=[put(pb(d['id']), lg)])
    for a in 'oxa':
        d = pur(nid('pd')); run(f'purchase delete [{a}]', w, a, [rm(pb(d['id']))], 'allow' if a == 'o' else 'deny', pre=[put(pb(d['id']), d)])
        d = pur(nid('pr')); admin([put(pb(d['id']), d)]); read(f'purchase read [{a}]', w, a, 'purchases/' + d['id'], 'allow' if a == 'o' else 'deny')
    run('purchase delete missing [o]', w, 'o', [rm(pb('nothere'))], 'allow')

    # closings
    def clo(m, **o):
        d = dict(id=m, month=m, createdAt=NOW, sealed=SEAL); d.update(o); return d

    def cc(label, m, doc, expect, actor='o', pre=()):
        run(f'closing write {label} [{actor}]', w, actor, [put(cl(m), doc)], expect, pre=pre)

    cc('valid', '2026-05', clo('2026-05'), 'allow'); cc('valid', '2026-05', clo('2026-05'), 'deny', 'x'); cc('valid', '2026-05', clo('2026-05'), 'deny', 'a')
    for m, exp in [('2026-01', 'allow'), ('2026-12', 'allow'), ('2026-00', 'deny'), ('2026-13', 'deny'), ('2026-5', 'deny'), ('26-05', 'deny'), ('2026-05-01', 'deny'), ('x2026-05', 'deny'), ('2026-050', 'deny'), ('0000-01', 'allow')]:
        cc(f'month id {m}', m, clo(m), exp)
    cc('id differs', '2026-06', clo('2026-06', id='2026-07'), 'deny'); cc('month differs', '2026-06', clo('2026-06', month='2026-07'), 'deny')
    cc('createdAt future', '2026-06', clo('2026-06', createdAt=NOW + HOUR + 60000), 'deny'); cc('createdAt near', '2026-06', clo('2026-06', createdAt=NOW + HOUR - 60000), 'allow')
    cc('createdAt string', '2026-06', clo('2026-06', createdAt='x'), 'deny')
    for name, value, exp in SEALED_VARIANTS: cc(f'sealed {name}', '2026-07', clo('2026-07', sealed=value), exp)
    cc('extra key', '2026-07', clo('2026-07', extra=1), 'deny')
    for key in ['id', 'month', 'createdAt', 'sealed']:
        cc(f'without {key}', '2026-08', without(clo('2026-08'), key), 'deny')
    cc('overwrite existing', '2026-09', clo('2026-09', createdAt=NOW - 5), 'allow', pre=[put(cl('2026-09'), clo('2026-09'))])
    cc('overwrite existing as other', '2026-09', clo('2026-09', createdAt=NOW - 5), 'deny', 'x', pre=[put(cl('2026-09'), clo('2026-09'))])
    run('closing partial update [o]', w, 'o', [put(cl('2026-09'), {'createdAt': NOW - 9}, ['createdAt'])], 'allow')
    run('closing partial update remove sealed [o]', w, 'o', [put(cl('2026-09'), {}, ['sealed'])], 'deny')
    for a in 'oxa':
        run(f'closing delete [{a}]', w, a, [rm(cl('2026-10'))], 'allow' if a == 'o' else 'deny', pre=[put(cl('2026-10'), clo('2026-10'))])
        read(f'closing read [{a}]', w, a, 'closings/2026-09', 'allow' if a == 'o' else 'deny')
    run('closing delete bad month id [o]', w, 'o', [rm(cl('bogus'))], 'allow')
    run('closing update bad month id stored [o]', w, 'o', [put(cl('bogus'), clo('bogus'))], 'deny')


# ---------------------------------------------------------------------------------------------------------
# moves
# ---------------------------------------------------------------------------------------------------------
def moves():
    w = World('mov')
    mb = lambda id: w.p('moves/' + id)
    ib = lambda id: w.p('items/' + id)
    DATE = TODAY - 12 * DAY
    BILL = 'billA'
    admin([put(ib('billA'), item_doc('billA', 'bill')), put(ib('billB'), item_doc('billB', 'bill')), put(ib('envA'), item_doc('envA', 'envelope')),
           put(ib('bill.x'), item_doc('bill.x', 'bill')), put(ib('billK'), item_doc('billK', 'bill'))])

    def mv(id, **o):
        d = dict(id=id, kind='billPaid', date=DATE, refId=BILL, reversesMoveId=None, createdAt=NOW, sealed=SEAL)
        d.update(o); return d

    paid_id = lambda ref, date, suffix='': f'paid_{ref}_{stamp(date)}{suffix}'

    def m(label, d, expect, actor='o', pre=(), extra=()):
        run(f'move {label} [{actor}]', w, actor, [put(mb(d['id']), d)] + list(extra), expect, pre=pre)

    # paid
    def paid(label, expect, actor='o', ref=BILL, date=DATE, suffix='', id=None, **o):
        pid = id or paid_id(ref, date, suffix)
        m(f'paid {label}', mv(pid, refId=ref, date=date, **o), expect, actor)

    paid('valid', 'allow', date=TODAY - 100 * DAY); paid('valid', 'deny', 'x', date=TODAY - 101 * DAY); paid('valid', 'deny', 'a', date=TODAY - 102 * DAY)
    paid('suffix _2', 'allow', suffix='_2'); paid('suffix _12', 'allow', suffix='_12'); paid('suffix _x', 'deny', suffix='_x'); paid('suffix _', 'deny', suffix='_')
    paid('suffix 2', 'deny', suffix='2'); paid('suffix _2_3', 'deny', suffix='_2_3')
    paid('id date differs', 'deny', id=paid_id(BILL, DATE + DAY)); paid('id ref differs', 'deny', id=paid_id('billB', DATE + 2 * DAY))
    paid('id prefix differs', 'deny', id=f'pay_{BILL}_{stamp(DATE + 3 * DAY)}', date=DATE + 3 * DAY)
    paid('second bill', 'allow', ref='billB'); paid('envelope not a bill', 'deny', ref='envA', date=DATE + DAY); paid('missing item', 'deny', ref='ghost', date=DATE + 2 * DAY)
    paid('refId number', 'deny', ref=5, id='paid_5_x'); paid('refId null', 'deny', ref=None, id='paid_None_x')
    paid('date not midnight', 'deny', date=DATE + 4 * DAY + 5, id=paid_id(BILL, DATE + 4 * DAY))
    paid('date string', 'deny', date='x', id='paid_billA_x'); paid('date null', 'deny', date=None, id='paid_billA_y')
    paid('kind other', 'deny', date=DATE + 5 * DAY, kind='transfer'); paid('kind null', 'deny', date=DATE + 6 * DAY, kind=None)
    paid('extra key', 'deny', date=DATE + 7 * DAY, extra=1)
    paid('createdAt future', 'deny', date=DATE + 8 * DAY, createdAt=NOW + HOUR + 60000); paid('createdAt near', 'allow', date=DATE + 9 * DAY, createdAt=NOW + HOUR - 60000)
    paid('createdAt string', 'deny', date=DATE + 10 * DAY, createdAt='x')
    for i, (name, value, exp) in enumerate(SEALED_VARIANTS): paid(f'sealed {name}', exp, date=DATE + (20 + i) * DAY, sealed=value)
    d = mv(paid_id(BILL, DATE + 50 * DAY), date=DATE + 50 * DAY); run('move id field differs from doc id [o]', w, 'o', [put(mb(paid_id(BILL, DATE + 50 * DAY)), dict(d, id='different'))], 'deny')
    paid('regex dot ref', 'allow', ref='bill.x', date=DATE + 60 * DAY)
    paid('regex dot ref id lookalike', None, ref='bill.x', date=DATE + 61 * DAY, id=f'paid_billzx_{stamp(DATE + 61 * DAY)}')
    for key in ['id', 'kind', 'date', 'refId', 'reversesMoveId', 'createdAt', 'sealed']:
        d = without(mv(paid_id(BILL, DATE + 70 * DAY), date=DATE + 70 * DAY), key); run(f'move paid without {key} [o]', w, 'o', [put(mb(d.get('id', 'mm')), d)], 'deny')
    d = mv(paid_id(BILL, DATE + 80 * DAY), date=DATE + 80 * DAY)
    run('move paid twice [o]', w, 'o', [put(mb(d['id']), d)], None, pre=[put(mb(d['id']), d)])
    # undo
    def undo(label, expect, actor='o', mark=None, target=None, **o):
        mark = mark or mv(paid_id(BILL, DATE + nid_n() * DAY), reversesMoveId=None)
        uid_ = 'unpaid_' + mark['id']
        d = mv(uid_, date=mark['date'], refId=mark['refId'], reversesMoveId=mark['id'])
        d.update(o)
        pre = [put(mb(mark['id']), mark)] if target is None else target
        run(f'move undo {label} [{actor}]', w, actor, [put(mb(d['id']), d)], expect, pre=pre)

    cnt = [100]
    def nid_n():
        cnt[0] += 1; return cnt[0]

    def mk_mark(**o):
        dt = DATE + nid_n() * DAY
        return mv(paid_id(BILL, dt), date=dt, **o)

    undo('valid', 'allow', mark=mk_mark()); undo('valid', 'deny', 'x', mark=mk_mark()); undo('valid', 'deny', 'a', mark=mk_mark())
    undo('of a _2 mark', 'allow', mark=(lambda dt: mv(paid_id(BILL, dt, '_2'), date=dt))(DATE + nid_n() * DAY))
    undo('missing mark', 'deny', mark=mk_mark(), target=[])
    undo('other bill mark', 'deny', mark=mk_mark(), refId='billB')
    undo('other date', 'deny', mark=mk_mark(), date=DATE + 90 * DAY)
    undo('mark that is itself an undo', 'deny', mark=mk_mark(reversesMoveId='something'))
    mk = mk_mark(); undo('mark without reversesMoveId key (legacy)', 'deny', mark=without(mk, 'reversesMoveId'))
    mk = mk_mark(); undo('mark of kind start', None, mark=dict(mk, kind='start'))
    mk = mk_mark(); d = mv('undo_x', date=mk['date'], reversesMoveId=mk['id']); m('undo wrong id', d, 'deny', pre=[put(mb(mk['id']), mk)])
    mk = mk_mark(); d = mv('unpaid_zzz', date=mk['date'], reversesMoveId=mk['id']); m('undo id not naming the mark', d, 'deny', pre=[put(mb(mk['id']), mk)])
    mk = mk_mark(); d = mv('unpaid_' + mk['id'], date=mk['date'], reversesMoveId=5); m('undo reversesMoveId number', d, 'deny', pre=[put(mb(mk['id']), mk)])
    mk = mk_mark(); d = mv('unpaid_' + mk['id'], date=mk['date'], reversesMoveId=mk['id'], extra=1); m('undo extra key', d, 'deny', pre=[put(mb(mk['id']), mk)])
    mk = mk_mark(); d = mv('unpaid_' + mk['id'], date=mk['date'], reversesMoveId=mk['id'], sealed={'value': 'x'}); m('undo sealed bad', d, 'deny', pre=[put(mb(mk['id']), mk)])
    mk = mk_mark(); d = mv('unpaid_' + mk['id'], date=mk['date'], reversesMoveId=mk['id'], createdAt=NOW + HOUR + 60000); m('undo createdAt future', d, 'deny', pre=[put(mb(mk['id']), mk)])
    mk = mk_mark(); u = mv('unpaid_' + mk['id'], date=mk['date'], reversesMoveId=mk['id'])
    m('undo twice', u, 'deny', pre=[put(mb(mk['id']), mk), put(mb(u['id']), u)])
    mk = mk_mark(); u = mv('unpaid_' + mk['id'], date=mk['date'], reversesMoveId=mk['id']); uu = mv('unpaid_' + u['id'], date=mk['date'], reversesMoveId=u['id'])
    m('undo of an undo', uu, 'deny', pre=[put(mb(mk['id']), mk), put(mb(u['id']), u)])
    mk = mk_mark(); u = mv('unpaid_' + mk['id'], date=mk['date'], reversesMoveId=mk['id'])
    m('undo in the same batch as its mark', u, 'deny', extra=[put(mb(mk['id']), mk)])
    # deletes, updates, reads
    for a in 'oxa':
        mk = mk_mark(); run(f'move update [{a}]', w, a, [put(mb(mk['id']), {'createdAt': NOW - 3}, ['createdAt'])], 'deny', pre=[put(mb(mk['id']), mk)])
        run(f'move delete [{a}]', w, a, [rm(mb(mk['id']))], 'deny')
        read(f'move read [{a}]', w, a, 'moves/' + mk['id'], 'allow' if a == 'o' else 'deny')

    # starts
    SD = w.plan_doc['startDate']
    def start_id(ref, ct): return f"start_{'money' if ref is None else ref}_{ct}"

    def st(label, expect, actor='o', ref=None, date=SD, ct=None, id=None, plan_write=None, **o):
        ct = ct or (NOW - nid_n())
        sid = (id or start_id(ref, ct)) if (id or isinstance(ref, (str, type(None)))) else 'start_x_1'
        d = mv(sid, kind='start', date=date, refId=ref, createdAt=ct, **o)
        extra = [put(w.base, plan_write, list(plan_write))] if plan_write else []
        run(f'move start {label} [{actor}]', w, actor, [put(mb(sid), d)] + extra, expect, reset=bool(plan_write))

    st('money', 'allow'); st('money', 'deny', 'x'); st('money', 'deny', 'a')
    st('holding', 'allow', ref='billA'); st('holding 200 chars', 'allow', ref='r' * 200); st('holding 201 chars', 'deny', ref='r' * 201)
    st('holding not an item', 'allow', ref='ghost'); st('refId number', 'deny', ref=5)
    st('date differs from plan', 'deny', date=SD + DAY)
    st('date differs but plan written in batch', 'allow', date=SD + DAY, plan_write={'startDate': SD + DAY, 'updatedAt': NOW})
    st('date set by batch plan write to null', 'deny', plan_write={'startDate': None, 'updatedAt': NOW})
    st('date not midnight', 'deny', date=SD + 5, plan_write={'startDate': SD + 5, 'updatedAt': NOW})
    st('date string', 'deny', date='x')
    st('reverses a move', 'deny', reversesMoveId='x')
    st('id without createdAt', 'deny', id='start_money')
    st('id naming another holding', 'deny', ref='billA', id=start_id('billB', NOW - 7))
    st('id with other createdAt', 'deny', ct=NOW - 11, id=start_id(None, NOW - 12))
    st('createdAt future', 'deny', ct=NOW + HOUR + 60000); st('createdAt near', 'allow', ct=NOW + HOUR - 60000)
    for name, value, exp in SEALED_VARIANTS: st(f'sealed {name}', exp, sealed=value)
    st('extra key', 'deny', extra=1)
    for key in ['id', 'kind', 'date', 'refId', 'reversesMoveId', 'createdAt', 'sealed']:
        ct = NOW - nid_n(); d = without(mv(start_id(None, ct), kind='start', date=SD, createdAt=ct), key)
        run(f'move start without {key} [o]', w, 'o', [put(mb(start_id(None, ct)), d)], 'deny')
    nostart = World('movn', startDate=None)
    ct = NOW - nid_n(); run('move start plan startDate null [o]', nostart, 'o', [put(nostart.p('moves/' + start_id(None, ct)), mv(start_id(None, ct), kind='start', date=SD, refId=None, createdAt=ct))], 'deny')
    nokeyw = World('movk'); admin([put(nokeyw.base, without(nokeyw.plan_doc, 'startDate'))])
    ct = NOW - nid_n(); run('move start plan without startDate key [o]', nokeyw, 'o', [put(nokeyw.p('moves/' + start_id(None, ct)), mv(start_id(None, ct), kind='start', date=SD, refId=None, createdAt=ct))], 'deny')
    noplan = World('movx', plan=False)
    ct = NOW - nid_n(); run('move start no plan document [o]', noplan, 'o', [put(noplan.p('moves/' + start_id(None, ct)), mv(start_id(None, ct), kind='start', date=SD, refId=None, createdAt=ct))], 'deny')
    ct = NOW - nid_n(); run('move start creating the plan in the batch [o]', noplan, 'o', [put(noplan.p('moves/' + start_id(None, ct)), mv(start_id(None, ct), kind='start', date=SD, refId=None, createdAt=ct)),
                                                                                         put(noplan.base, dict(noplan.plan_doc, uid=noplan.uid, startDate=None, trackingPeriods=[], createdAt=NOW, updatedAt=NOW))], 'deny')
    for a in 'oxa':
        ct = NOW - nid_n(); sid = start_id(None, ct); admin([put(mb(sid), mv(sid, kind='start', date=SD, refId=None, createdAt=ct))])
        run(f'move start update [{a}]', w, a, [put(mb(sid), {'date': SD}, ['date'])], 'deny'); run(f'move start delete [{a}]', w, a, [rm(mb(sid))], 'deny')
        read(f'move start read [{a}]', w, a, 'moves/' + sid, 'allow' if a == 'o' else 'deny')

    # tracking changes
    last = w.plan_doc['trackingPeriods'][-1]
    def tr(label, expect, actor='o', date=None, ct=None, id=None, periods=None, world=None, **o):
        ww = world or w
        date = TODAY - 2 * DAY if date is None else date
        ct = ct or (NOW - nid_n())
        tid = id or f'tracking_{stamp(date) if isinstance(date, int) else "x"}_{ct}'
        d = dict(id=tid, kind='trackingChange', date=date, refId=None, reversesMoveId=None, createdAt=ct, sealed=SEAL); d.update(o)
        extra = [put(ww.base, {'trackingPeriods': periods, 'updatedAt': NOW}, ['trackingPeriods', 'updatedAt'])] if periods is not None else []
        run(f'move tracking {label} [{actor}]', ww, actor, [put(ww.p('moves/' + tid), d)] + extra, expect, reset=periods is not None)

    P0 = w.plan_doc['trackingPeriods']
    T2 = TODAY - 2 * DAY
    tr('open new period', 'allow', periods=P0[:-1] + [dict(last, to=TODAY - 3 * DAY), {'from': T2, 'to': None}])
    tr('open new period', 'deny', 'x', periods=P0[:-1] + [dict(last, to=TODAY - 3 * DAY), {'from': T2, 'to': None}])
    tr('open new period', 'deny', 'a', periods=P0[:-1] + [dict(last, to=TODAY - 3 * DAY), {'from': T2, 'to': None}])
    tr('close the period', 'allow', date=T2, periods=P0[:-1] + [dict(last, to=T2)])
    tr('date is neither edge', 'deny', date=TODAY - 3 * DAY, periods=P0[:-1] + [dict(last, to=T2)])
    tr('date is the first day of the last period, no plan write', 'allow', date=last['from'])
    tr('date is not an edge, no plan write', 'deny', date=TODAY - 29 * DAY)
    tr('date is the end of an earlier period', 'deny', date=P0[0]['to'])
    tr('date is an end of the last period with null to', 'deny', date=TODAY)
    tr('date not midnight', 'deny', date=T2 + 5, periods=P0[:-1] + [dict(last, to=T2)])
    tr('date string', 'deny', date='x')
    tr('refId set', 'deny', refId='billA', periods=P0[:-1] + [dict(last, to=T2)], date=T2)
    tr('reversesMoveId set', 'deny', reversesMoveId='x', periods=P0[:-1] + [dict(last, to=T2)], date=T2)
    tr('id differs from date', 'deny', date=T2, id=f'tracking_{stamp(T2 - DAY)}_{NOW - 3}', ct=NOW - 3, periods=P0[:-1] + [dict(last, to=T2)])
    tr('id with other createdAt', 'deny', date=T2, id=f'tracking_{stamp(T2)}_{NOW - 9}', ct=NOW - 8, periods=P0[:-1] + [dict(last, to=T2)])
    tr('createdAt future', 'deny', date=T2, ct=NOW + HOUR + 60000, periods=P0[:-1] + [dict(last, to=T2)])
    for name, value, exp in SEALED_VARIANTS: tr(f'sealed {name}', exp, date=T2, sealed=value, periods=P0[:-1] + [dict(last, to=T2)])
    tr('extra key', 'deny', date=T2, extra=1, periods=P0[:-1] + [dict(last, to=T2)])
    tr('plan periods set empty in batch', 'deny', date=T2, periods=[])
    tr('plan period invalid last in batch', 'deny', date=T2, periods=[{'from': 'x', 'to': None}])
    tr('kind other', 'deny', date=T2, kind='tracking', periods=P0[:-1] + [dict(last, to=T2)])
    for key in ['id', 'kind', 'date', 'refId', 'reversesMoveId', 'createdAt', 'sealed']:
        ct = NOW - nid_n(); tid = f'tracking_{stamp(last["from"])}_{ct}'
        d = without(dict(id=tid, kind='trackingChange', date=last['from'], refId=None, reversesMoveId=None, createdAt=ct, sealed=SEAL), key)
        run(f'move tracking without {key} [o]', w, 'o', [put(mb(tid), d)], 'deny')
    emptyp = World('movp', trackingPeriods=[])
    tr('plan without periods', 'deny', date=T2, world=emptyp)
    nokeyp = World('movq'); admin([put(nokeyp.base, without(nokeyp.plan_doc, 'trackingPeriods'))])
    tr('plan without trackingPeriods key', 'deny', date=T2, world=nokeyp)
    nop = World('movr', plan=False)
    tr('no plan document', 'deny', date=T2, world=nop)
    for a in 'oxa':
        ct = NOW - nid_n(); tid = f'tracking_{stamp(last["from"])}_{ct}'
        admin([put(mb(tid), dict(id=tid, kind='trackingChange', date=last['from'], refId=None, reversesMoveId=None, createdAt=ct, sealed=SEAL))])
        run(f'move tracking update [{a}]', w, a, [put(mb(tid), {'date': last['from']}, ['date'])], 'deny'); run(f'move tracking delete [{a}]', w, a, [rm(mb(tid))], 'deny')
        read(f'move tracking read [{a}]', w, a, 'moves/' + tid, 'allow' if a == 'o' else 'deny')
    # unknown kind and id mismatch
    for k in ['transfer', 'correction', None, 5]:
        ct = NOW - nid_n(); d = mv(f'k_{ct}', kind=k, date=DATE); run(f'move kind {k!r} [o]', w, 'o', [put(mb(d['id']), d)], 'deny')

# ---------------------------------------------------------------------------------------------------------
# wrong-typed values in every field a rule reads
# ---------------------------------------------------------------------------------------------------------
ODD = [('true', True), ('float', 1.5), ('str', 'x'), ('list', []), ('map', {}), ('null', None), ('zero', 0), ('neg', -1), ('numstr', '5')]


def batteries():
    w = World('bat')
    ib = lambda id: w.p('items/' + id)
    cb = lambda id: w.p('changes/' + id)
    ON = TODAY - 5 * DAY

    def odd(prefix, fields, mk):
        for f in fields:
            for name, val in ODD:
                doc = mk(f, val)
                run(f'{prefix} {f}={name} [o]', w, 'o', doc['writes'], None, pre=doc.get('pre', ()))

    day_doc = lambda pl, status='draft', **o: dict(dict(id=f'{pl}_{stamp(ON)}', payLineId=pl, sourceId=None, expectedOn=ON, arrivedOn=ON if status == 'confirmed' else None,
                                                        status=status, createdAt=NOW, confirmedAt=NOW if status == 'confirmed' else None, doneLineIds=[], sealed=SEAL), **o)
    rec_doc = lambda day_id, kind, **o: dict(dict(id=f'{day_id}_{kind}', dayId=day_id, kind=kind, createdAt=NOW, sealed=SEAL), **o)
    recs_of = lambda id: [put(w.p(f'days/{id}/records/{id}_{k}'), rec_doc(id, k)) for k in ('proposed', 'confirmed')]

    # plan
    def plan_create(f, val):
        d = dict(uid=w.uid, createdAt=NOW, updatedAt=NOW, stance='conservative', startDate=None, dirtyFrom=None, keyId='k1', sealed=SEAL)
        d[f] = val
        return dict(writes=[put(w.base, d)], pre=[rm(w.base)])
    plan_fields = ['uid', 'createdAt', 'updatedAt', 'stance', 'startDate', 'dirtyFrom', 'keyId', 'sealed', 'trackingPeriods']
    odd('odd plan create', plan_fields, plan_create)
    odd('odd plan update', plan_fields, lambda f, val: dict(writes=[put(w.base, {f: val}, [f])], pre=[put(w.base, w.plan_doc)]))
    for name, val in ODD:
        for label, body in [('period.from', {'trackingPeriods': [{'from': val, 'to': None}]}), ('period.to', {'trackingPeriods': [{'from': TODAY, 'to': val}]}),
                            ('sealed.keyVersion', {'sealed': dict(SEAL, keyVersion=val)}), ('sealed.value', {'sealed': dict(SEAL, value=val)}),
                            ('sealed.algorithm', {'sealed': dict(SEAL, algorithm=val)}), ('sealed.nonce', {'sealed': dict(SEAL, nonce=val)}), ('sealed.keyId', {'sealed': dict(SEAL, keyId=val)})]:
            run(f'odd plan update {label}={name} [o]', w, 'o', [put(w.base, body, list(body))], None, pre=[put(w.base, w.plan_doc)])
    for name, val in [('float midnight', float(TODAY)), ('float off', TODAY + 0.5), ('huge', 10 ** 18), ('neg midnight', -DAY)]:
        run(f'plan update startDate {name} [o]', w, 'o', [put(w.base, {'startDate': val}, ['startDate'])], None, pre=[put(w.base, w.plan_doc)])
        run(f'plan update updatedAt {name} [o]', w, 'o', [put(w.base, {'updatedAt': val}, ['updatedAt'])], None, pre=[put(w.base, w.plan_doc)])

    # items
    def item_create(f, val):
        d = item_doc(nid('bi')); pid = d['id']; d[f] = val
        return dict(writes=[put(ib(pid), d)])
    item_fields = ['id', 'kind', 'parentId', 'createdAt', 'endedAt', 'archivedAt']
    odd('odd item create', item_fields, item_create)

    def item_update(f, val):
        it = item_doc(nid('bu'))
        return dict(writes=[put(ib(it['id']), dict(it, **{f: val})), put(cb('ended_' + it['id']), change_doc('ended_' + it['id'], 'ended'))], pre=[put(ib(it['id']), it)])
    odd('odd item update', item_fields, item_update)

    # versions and changes
    ver_pre = lambda i, c: [put(ib(i), item_doc(i)), put(cb(c), change_doc(c)), put(ib('5'), item_doc('5')), put(cb('7'), change_doc('7'))]

    def ver(f, val):
        i = nid('bi'); c = nid('bc')
        d = version_doc(nid('bv'), i, 'bill', c); pid = d['id']; d[f] = val
        return dict(writes=[put(w.p('versions/' + pid), d)], pre=ver_pre(i, c))
    odd('odd version', ['id', 'itemId', 'kind', 'createdAt', 'effectiveFrom', 'effectiveUntil', 'changeId'], ver)
    for f, val in [('itemId', 5), ('changeId', 7)]:
        i = nid('bi'); c = nid('bc'); d = version_doc(nid('bv'), i, 'bill', c); d[f] = val
        run(f'version {f} numeric naming an existing doc [o]', w, 'o', [put(w.p('versions/' + d['id']), d)], 'deny', pre=ver_pre(i, c))
    for kind in ['source', 'bill']:
        for ik in ['envelope', 'source']:
            i = nid('bi'); c = nid('bc'); d = version_doc(nid('bv'), i, kind, c)
            run(f'version kind {kind} on item of kind {ik} [o]', w, 'o', [put(w.p('versions/' + d['id']), d)], 'allow' if kind == ik else 'deny', pre=[put(ib(i), item_doc(i, ik)), put(cb(c), change_doc(c))])

    def chgf(f, val):
        d = change_doc(nid('bc')); pid = d['id']; d[f] = val
        return dict(writes=[put(cb(pid), d)])
    odd('odd change', ['id', 'kind', 'createdAt', 'effectiveFrom', 'itemIds'], chgf)

    # days and records
    def day(f, val):
        d = day_doc(nid('bp')); pid = d['id']; d[f] = val
        return dict(writes=[put(w.p('days/' + pid), d)])
    odd('odd day create', ['id', 'payLineId', 'sourceId', 'expectedOn', 'arrivedOn', 'status', 'createdAt', 'confirmedAt', 'doneLineIds'], day)
    for label, value, idstamp in [('timestamp', Ts(ON), stamp(ON)), ('float', float(ON), stamp(ON)), ('at 23:59', ON + DAY - 1, stamp(ON)), ('year 1970', 0, '19700101')]:
        pl = nid('bp')
        run(f'day create expectedOn {label} [o]', w, 'o', [put(w.p(f'days/{pl}_{idstamp}'), day_doc(pl, id=f'{pl}_{idstamp}', expectedOn=value))], None)

    def dayconf(f, val):
        d = day_doc(nid('bp'), 'confirmed'); pid = d['id']; d[f] = val
        return dict(writes=[put(w.p('days/' + pid), d)] + recs_of(pid))
    odd('odd confirmed day create', ['arrivedOn', 'confirmedAt', 'status'], dayconf)

    def record(f, val):
        d = day_doc(nid('bp'), 'confirmed'); id = d['id']
        r = rec_doc(id, 'proposed'); r[f] = val
        return dict(writes=[put(w.p('days/' + id), d), put(w.p(f'days/{id}/records/{id}_proposed'), r), put(w.p(f'days/{id}/records/{id}_confirmed'), rec_doc(id, 'confirmed'))])
    odd('odd record', ['id', 'dayId', 'kind', 'createdAt', 'supersedesId'], record)

    def correction(f, val):
        d = day_doc(nid('bp'), 'confirmed'); id = d['id']
        c = dict(id=f'{id}_confirmed_corrected', dayId=id, kind='correction', createdAt=NOW, sealed=SEAL, supersedesId=f'{id}_confirmed'); cid = c['id']; c[f] = val
        pre = [put(w.p('days/' + id), d), put(w.p(f'days/{id}/records/{id}_confirmed'), rec_doc(id, 'confirmed')), put(w.p(f'days/{id}/records/5'), rec_doc(id, 'confirmed', id='5')),
               put(w.p(f'days/{id}/records/5_corrected'), rec_doc(id, 'confirmed', id='5_corrected'))]
        return dict(writes=[put(w.p(f'days/{id}/records/{cid}'), c)], pre=pre)
    odd('odd correction', ['id', 'dayId', 'kind', 'createdAt', 'supersedesId'], correction)
    d = day_doc(nid('bp'), 'confirmed'); id = d['id']
    run('correction supersedesId numeric naming an existing record [o]', w, 'o',
        [put(w.p(f'days/{id}/records/5_corrected'), dict(id='5_corrected', dayId=id, kind='correction', createdAt=NOW, sealed=SEAL, supersedesId=5))], 'deny',
        pre=[put(w.p('days/' + id), d), put(w.p(f'days/{id}/records/5'), rec_doc(id, 'confirmed', id='5'))])

    def dayupd(f, val):
        d = day_doc(nid('bp')); id = d['id']
        body = {'status': 'confirmed', 'arrivedOn': ON, 'confirmedAt': NOW}; body[f] = val
        return dict(writes=[put(w.p('days/' + id), body, ['status', 'arrivedOn', 'confirmedAt'])] + recs_of(id), pre=[put(w.p('days/' + id), d)])
    odd('odd day confirm', ['status', 'arrivedOn', 'confirmedAt'], dayupd)

    def dayticks(f, val):
        d = day_doc(nid('bp'), 'confirmed')
        return dict(writes=[put(w.p('days/' + d['id']), {f: val}, [f])], pre=[put(w.p('days/' + d['id']), d)])
    odd('odd confirmed day update', ['doneLineIds', 'status', 'sealed'], dayticks)

    def drafts(f, val):
        d = day_doc(nid('bp'))
        return dict(writes=[put(w.p('days/' + d['id']), {f: val}, [f])], pre=[put(w.p('days/' + d['id']), d)])
    odd('odd draft day update', ['status', 'sealed', 'doneLineIds', 'arrivedOn'], drafts)

    # purchases and closings
    def pur(f, val):
        d = dict(id=nid('bq'), date=TODAY - 20 * DAY, source='manual', needsHome=False, createdAt=NOW, updatedAt=NOW, sealed=SEAL); pid = d['id']; d[f] = val
        return dict(writes=[put(w.p('purchases/' + pid), d)])
    odd('odd purchase', ['id', 'date', 'source', 'needsHome', 'createdAt', 'updatedAt'], pur)

    def purupd(f, val):
        d = dict(id=nid('bq'), date=TODAY - 20 * DAY, source='manual', needsHome=False, createdAt=NOW, updatedAt=NOW - 5000, sealed=SEAL)
        body = {'updatedAt': NOW}; body[f] = val
        return dict(writes=[put(w.p('purchases/' + d['id']), body, list(body))], pre=[put(w.p('purchases/' + d['id']), d)])
    odd('odd purchase update', ['date', 'updatedAt', 'source', 'needsHome', 'createdAt'], purupd)
    for name, val in [('float midnight', float(TODAY - 20 * DAY)), ('bool', True)]:
        d = dict(id=nid('bq'), date=val, source='manual', needsHome=False, createdAt=NOW, updatedAt=NOW, sealed=SEAL)
        run(f'purchase date {name} [o]', w, 'o', [put(w.p('purchases/' + d['id']), d)], None)
    for name, val in ODD:
        run(f'odd closing month={name} [o]', w, 'o', [put(w.p('closings/2027-01'), dict(id='2027-01', month=val, createdAt=NOW, sealed=SEAL))], None)
        run(f'odd closing createdAt={name} [o]', w, 'o', [put(w.p('closings/2027-02'), dict(id='2027-02', month='2027-02', createdAt=val, sealed=SEAL))], None)
        run(f'odd closing id={name} [o]', w, 'o', [put(w.p('closings/2027-03'), dict(id=val, month='2027-03', createdAt=NOW, sealed=SEAL))], None)

    # moves
    admin([put(ib('billA'), item_doc('billA', 'bill')), put(ib('5'), item_doc('5', 'bill'))])
    DATE = TODAY - 12 * DAY

    def mvdoc(id, **o):
        d = dict(id=id, kind='billPaid', date=DATE, refId='billA', reversesMoveId=None, createdAt=NOW, sealed=SEAL); d.update(o); return d

    def paid(f, val):
        d = mvdoc(f'paid_billA_{stamp(DATE)}_{nid("")}'); pid = d['id']; d[f] = val
        return dict(writes=[put(w.p('moves/' + pid), d)])
    odd('odd paid move', ['id', 'kind', 'date', 'refId', 'reversesMoveId', 'createdAt'], paid)
    for name, val in ODD:
        id = f'paid_{val}_{stamp(DATE)}' if isinstance(val, (str, int)) and not isinstance(val, bool) else 'paid_z'
        run(f'paid move refId={name} id from it [o]', w, 'o', [put(w.p('moves/' + id), mvdoc(id, refId=val))], None)

    def undo(f, val):
        mk = mvdoc(f'paid_billA_{stamp(DATE)}_{nid("")}'); u = mvdoc('unpaid_' + mk['id'], reversesMoveId=mk['id']); pid = u['id']; u[f] = val
        return dict(writes=[put(w.p('moves/' + pid), u)], pre=[put(w.p('moves/' + mk['id']), mk)])
    odd('odd undo move', ['id', 'date', 'refId', 'reversesMoveId', 'createdAt'], undo)
    run('undo reversesMoveId numeric naming an existing mark [o]', w, 'o', [put(w.p('moves/unpaid_5'), mvdoc('unpaid_5', reversesMoveId=5))], 'deny', pre=[put(w.p('moves/5'), mvdoc('5'))])

    SD = w.plan_doc['startDate']

    def start(f, val):
        ct = NOW - nid_count()
        d = mvdoc(f'start_money_{ct}', kind='start', date=SD, refId=None, createdAt=ct); pid = d['id']; d[f] = val
        return dict(writes=[put(w.p('moves/' + pid), d)])
    odd('odd start move', ['id', 'date', 'refId', 'reversesMoveId', 'createdAt'], start)
    for name, val in ODD:
        ct = NOW - nid_count()
        id = f'start_{val}_{ct}' if isinstance(val, (str, int)) and not isinstance(val, bool) else 'start_z'
        run(f'start move refId={name} id from it [o]', w, 'o', [put(w.p('moves/' + id), mvdoc(id, kind='start', date=SD, refId=val, createdAt=ct))], None)

    last = w.plan_doc['trackingPeriods'][-1]

    def tracking(f, val):
        ct = NOW - nid_count()
        d = mvdoc(f'tracking_{stamp(last["from"])}_{ct}', kind='trackingChange', date=last['from'], refId=None, createdAt=ct); pid = d['id']; d[f] = val
        return dict(writes=[put(w.p('moves/' + pid), d)])
    odd('odd tracking move', ['id', 'date', 'refId', 'reversesMoveId', 'createdAt'], tracking)
    for name, per in [('last period without to', [{'from': TODAY - 30 * DAY}]), ('to string', [{'from': TODAY - 30 * DAY, 'to': 'x'}]), ('from string', [{'from': 'x', 'to': None}]),
                      ('not a list', 'x'), ('empty', []), ('period not a map', ['x']), ('two periods', [{'from': TODAY - 30 * DAY, 'to': None}, {'from': TODAY - 30 * DAY, 'to': None}])]:
        ow = World('batp', trackingPeriods=per)
        d = dict(id=nid('bq'), date=TODAY - 20 * DAY, source='manual', needsHome=False, createdAt=NOW, updatedAt=NOW, sealed=SEAL)
        run(f'purchase with plan periods {name} [o]', ow, 'o', [put(ow.p('purchases/' + d['id']), d)], None)
        ct = NOW - nid_count()
        tid = f'tracking_{stamp(TODAY - 30 * DAY)}_{ct}'
        run(f'tracking move with plan periods {name} [o]', ow, 'o', [put(ow.p('moves/' + tid), mvdoc(tid, kind='trackingChange', date=TODAY - 30 * DAY, refId=None, createdAt=ct))], None)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--out'); args = ap.parse_args()
    for step in (server_paths, plan_doc, items, versions_changes, days_records, purchases_closings, moves, batteries):
        step()
    if args.out:
        with open(args.out, 'w') as f: json.dump(dict(sorted(results.items())), f, indent=1)
    allowed = sum(1 for v in results.values() if v == 200)
    print(f'{len(results)} cases, {allowed} allowed, {len(results) - allowed} refused')
    for m in mismatches: print('EXPECTATION MISMATCH', m)
    print(f'{len(mismatches)} expectation mismatches')
    sys.exit(1 if mismatches else 0)


main()
