# -*- coding: utf-8 -*-
"""本地 xlsx/csv 桥：只做「读写文件」，不含任何业务逻辑。
票 #9 端到端验收用；纯引擎（lib/engine.js）完全不知道这个文件存在。
子命令：
  init-main <path>    生成主表（5 员工，无邮箱列）
  init-source <path>  生成来源 CSV（姓名/邮箱）
  read-xlsx <path>    打印 JSON {columns, rows}
  read-values <path>  打印 JSON {columns, rows}（data_only=True，读重算后的缓存值）
  read-csv  <path>    打印 JSON [{...}]
  apply     <path> <cells.json>  按主键把 cells 写回 xlsx（缺列则补列）
"""
import sys, json, csv

def col_letter(n):
    s = ''
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s

def init_main(path):
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active; ws.title = '员工表'
    ws.append(['姓名', '部门', '工时', '时薪', '备注'])
    for r in [
        ['阿岚', '技术', 160, 80, ''],
        ['柏舟', '技术', 176, 80, ''],
        ['岑溪', '运营', 96, 60, ''],
        ['丁野', '运营', 144, 60, ''],
        ['尔芙', '人事', 88, 70, ''],
    ]:
        ws.append(r)
    wb.save(path); print('OK')

def init_source(path):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(['姓名', '邮箱'])
        for r in [
            ['阿岚', 'alan@example.com'], ['柏舟', 'baizhou@example.com'],
            ['岑溪', 'cenxi@example.com'], ['丁野', 'dingye@example.com'],
            ['尔芙', 'erfu@example.com'],
        ]:
            w.writerow(r)
    print('OK')

def _dump(path, data_only):
    """把一张 sheet 打印成 JSON {columns, rows}。
    data_only=False 读公式字符串本身；True 读重算后的缓存值。"""
    from openpyxl import load_workbook
    ws = load_workbook(path, data_only=data_only).active
    grid = [[c.value for c in row] for row in ws.iter_rows()]
    if not grid:
        print(json.dumps({'columns': [], 'rows': []}, ensure_ascii=False)); return
    columns = [('' if v is None else str(v)) for v in grid[0]]
    rows = []
    for r in grid[1:]:
        if all(v is None for v in r): continue
        rows.append({columns[i]: ('' if i >= len(r) or r[i] is None else r[i]) for i in range(len(columns))})
    print(json.dumps({'columns': columns, 'rows': rows}, ensure_ascii=False))

def read_xlsx(path):
    _dump(path, data_only=False)

def read_values(path):
    """重算后读缓存值（data_only=True）：公式格返回计算值，无缓存返回 None。"""
    _dump(path, data_only=True)

def read_csv(path):
    with open(path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    print(json.dumps(rows, ensure_ascii=False))

def apply(path, cells_json):
    from openpyxl import load_workbook
    with open(cells_json, encoding='utf-8') as f:
        cells = json.load(f)
    wb = load_workbook(path); ws = wb.active
    header = [('' if c.value is None else str(c.value)) for c in ws[1]]
    # 主键列 = 第一列
    pk_col = 1
    row_of = {}
    for ri in range(2, ws.max_row + 1):
        v = ws.cell(row=ri, column=pk_col).value
        if v is not None: row_of[str(v)] = ri
    for c in cells:
        col = c['col']
        if col not in header:
            header.append(col); ws.cell(row=1, column=len(header), value=col)
        ci = header.index(col) + 1
        ri = row_of.get(str(c['row']))
        if ri is None: continue
        ws.cell(row=ri, column=ci, value=c['after'])
    wb.save(path); print('OK')

def create(path, structure_json):
    """按结构清单建一张空 xlsx（票 #52「从模板新建表格」）。
    structure_json: {primaryKey, columns:{列名:类型}, name?, mode?}。
    行为：写出表头（primaryKey 置首、其余列按清单顺序），无数据行。
    纯 IO，结构合法性由 lib/engine.js 的 createTable/validateManifest 保证（桥不判业务）。
    """
    from openpyxl import Workbook
    with open(structure_json, encoding='utf-8') as f:
        structure = json.load(f)
    pk = structure.get('primaryKey') or '姓名'
    cols = structure.get('columns') or {}
    # 列序：主键置首，其余保持清单原序（不重复主键）
    header = [pk] + [c for c in cols.keys() if c != pk]
    wb = Workbook(); ws = wb.active
    title = structure.get('name') or 'Sheet1'
    try:
        ws.title = str(title)[:31]
    except Exception:
        ws.title = 'Sheet1'
    ws.append(header)
    wb.save(path)
    print('OK')

def probe(path):
    """上传文件字节探测（纯 IO，判定逻辑在 lib/engine.js 的 checkUpload）。
    输出 {filename, ext, isZip, openable, encrypted, hasMacro}。
    - isZip：前 4 字节 PK\\x03\\x04（xlsx 本质是 zip）
    - openable：openpyxl 能否打开（csv/tsv 视为文本、跳过）
    - encrypted：openpyxl 抛「加密/密码」类异常，或非 zip 的 OLE2 复合文档（加密 xlsx 常见）
    - hasMacro：zip 内含 xl/vbaProject.bin（.xlsm 带宏）。
    """
    import os, zipfile
    name = os.path.basename(path)
    ext = os.path.splitext(name)[1].lower()
    with open(path, 'rb') as f:
        head = f.read(8)
    is_zip = head[:4] == b'PK\x03\x04'
    is_ole = head[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'
    encrypted = False
    openable = False
    has_macro = False
    if is_zip:
        try:
            with zipfile.ZipFile(path) as z:
                has_macro = any('vbaProject.bin' in n for n in z.namelist())
        except Exception:
            pass
        try:
            from openpyxl import load_workbook
            load_workbook(path, read_only=True)
            openable = True
        except Exception as e:
            msg = str(e).lower()
            encrypted = 'encrypt' in msg or 'password' in msg or 'credential' in msg
    elif is_ole:
        # OLE2 复合文档：加密的 xls/xlsx 或老 .xls；无法用 openpyxl 读 → 视为加密/不可读
        encrypted = True
    elif ext in ('.csv', '.tsv'):
        openable = True  # 文本，交 read-csv 读
    print(json.dumps({
        'filename': name, 'ext': ext, 'isZip': is_zip,
        'openable': openable, 'encrypted': encrypted, 'hasMacro': has_macro
    }, ensure_ascii=False))

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'init-main': init_main(sys.argv[2])
    elif cmd == 'init-source': init_source(sys.argv[2])
    elif cmd == 'read-xlsx': read_xlsx(sys.argv[2])
    elif cmd == 'read-values': read_values(sys.argv[2])
    elif cmd == 'read-csv': read_csv(sys.argv[2])
    elif cmd == 'apply': apply(sys.argv[2], sys.argv[3])
    elif cmd == 'create': create(sys.argv[2], sys.argv[3])
    elif cmd == 'probe': probe(sys.argv[2])
    else: raise SystemExit('unknown command: ' + cmd)
