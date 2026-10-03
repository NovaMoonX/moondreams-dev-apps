# helpers for rules checks against the Firestore emulator REST API
import json, urllib.request, urllib.error
AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake'
FS='http://127.0.0.1:8080/v1/projects/moondreams-dev-apps/databases/(default)/documents/'
def token(email):
    r=urllib.request.Request(AUTH,data=json.dumps({'email':email,'password':'local-fixture-password','returnSecureToken':True}).encode(),headers={'Content-Type':'application/json'})
    return json.load(urllib.request.urlopen(r))['idToken']
def enc(v):
    if v is None: return {'nullValue':None}
    if isinstance(v,bool): return {'booleanValue':v}
    if isinstance(v,int): return {'integerValue':str(v)}
    if isinstance(v,float): return {'doubleValue':v}
    if isinstance(v,str): return {'stringValue':v}
    if isinstance(v,list): return {'arrayValue':{'values':[enc(x) for x in v]}}
    if isinstance(v,dict): return {'mapValue':{'fields':{k:enc(x) for k,x in v.items()}}}
def req(method,path,tok=None,data=None,mask=None):
    url=FS+path+(('?'+'&'.join('updateMask.fieldPaths='+m for m in mask)) if mask else '')
    h={'Content-Type':'application/json'}
    if tok: h['Authorization']='Bearer '+tok
    body=json.dumps({'fields':{k:enc(v) for k,v in data.items()}}).encode() if data is not None else None
    try:
        urllib.request.urlopen(urllib.request.Request(url,data=body,headers=h,method=method)); return 200
    except urllib.error.HTTPError as e: return e.code
def check(label,code,expect):
    ok=(code==200)==(expect=='allow'); print(('PASS' if ok else 'FAIL'),label,code); return ok
