"""
Minimal reader for a Bedrock world's db/ folder (LevelDB: .ldb tables and the
.log journal, zlib / raw-deflate blocks) and little-endian NBT. Enough to pull
structure templates ("structuretemplate_<name>") out of a world.
"""
import os, struct, zlib


def varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1
        r |= (c & 0x7f) << s; s += 7
        if c < 0x80: return r, i

def read_log(path, out):
    data = open(path, 'rb').read()
    rec = b''
    pos = 0
    while pos + 7 <= len(data):
        blk_left = 32768 - pos % 32768
        if blk_left < 7:
            pos += blk_left; continue
        crc, ln, typ = struct.unpack_from('<IHB', data, pos)
        pos += 7
        frag = data[pos:pos + ln]; pos += ln
        if typ == 0 and ln == 0:
            pos += 32768 - pos % 32768 if pos % 32768 else 0
            continue
        if typ == 1:
            batch(frag, out)
        elif typ == 2:
            rec = frag
        elif typ == 3:
            rec += frag
        elif typ == 4:
            rec += frag; batch(rec, out); rec = b''

def batch(b, out):
    seq, cnt = struct.unpack_from('<QI', b, 0)
    i = 12
    for n in range(cnt):
        tag = b[i]; i += 1
        kl, i = varint(b, i); k = b[i:i + kl]; i += kl
        if tag == 1:
            vl, i = varint(b, i); v = b[i:i + vl]; i += vl
            put(out, k, seq + n, v)
        else:
            put(out, k, seq + n, None)

def put(out, k, seq, v):
    old = out.get(k)
    if old is None or old[0] <= seq:
        out[k] = (seq, v)

def block(data, off, size):
    raw = data[off:off + size]
    t = data[off + size]
    if t == 0: return raw
    if t == 2: return zlib.decompress(raw)
    if t == 4: return zlib.decompress(raw, -15)
    raise ValueError('compression %d' % t)

def entries(b):
    nrest = struct.unpack_from('<I', b, len(b) - 4)[0]
    end = len(b) - 4 - 4 * nrest
    i = 0; key = b''
    while i < end:
        sh, i = varint(b, i); un, i = varint(b, i); vl, i = varint(b, i)
        key = key[:sh] + b[i:i + un]; i += un
        v = b[i:i + vl]; i += vl
        yield key, v

def read_ldb(path, out):
    data = open(path, 'rb').read()
    foot = data[-48:]
    i = 0
    _, i = varint(foot, i); _, i = varint(foot, i)
    io, i = varint(foot, i); isz, i = varint(foot, i)
    for _, h in entries(block(data, io, isz)):
        o, j = varint(h, 0); s, j = varint(h, j)
        for k, v in entries(block(data, o, s)):
            uk, tail = k[:-8], struct.unpack('<Q', k[-8:])[0]
            put(out, uk, tail >> 8, v if (tail & 0xff) == 1 else None)

def load(db):
    out = {}
    for f in sorted(os.listdir(db)):
        if f.endswith('.ldb') or f.endswith('.sst'): read_ldb(os.path.join(db, f), out)
    for f in sorted(os.listdir(db)):
        if f.endswith('.log'): read_log(os.path.join(db, f), out)
    return {k: v for k, (s, v) in out.items() if v is not None}


def read_nbt(b):
    i=[0]
    def u(fmt):
        v=struct.unpack_from('<'+fmt,b,i[0]); i[0]+=struct.calcsize('<'+fmt); return v[0]
    def s():
        n=u('H'); v=b[i[0]:i[0]+n].decode('utf-8','replace'); i[0]+=n; return v
    def p(t):
        if t==1: return u('b')
        if t==2: return u('h')
        if t==3: return u('i')
        if t==4: return u('q')
        if t==5: return u('f')
        if t==6: return u('d')
        if t==7: n=u('i'); v=b[i[0]:i[0]+n]; i[0]+=n; return v
        if t==8: return s()
        if t==9:
            et=u('B'); n=u('i'); return [p(et) for _ in range(n)]
        if t==10:
            d={}
            while True:
                et=u('B')
                if et==0: return d
                k=s(); d[k]=p(et)
        if t==11: n=u('i'); v=list(struct.unpack_from('<%di'%n,b,i[0])); i[0]+=4*n; return v
        if t==12: n=u('i'); v=list(struct.unpack_from('<%dq'%n,b,i[0])); i[0]+=8*n; return v
        raise ValueError(t)
    t=u('B'); s(); return p(t)
