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

# Windows 控制台/管道默认编码常是 cp1252/gbk，`print` 含中文时 json.dumps(...,ensure_ascii=False)
# 会抛 UnicodeEncodeError（CI windows-latest 全红根因）。强制把 stdout 切到 UTF-8。
# 注：sys.stdout.reconfigure 仅 Python 3.7+ 有；Python 3.6（本机 Anaconda）无此方法，
# 用 io.TextIOWrapper 包一层兜底，保证新老解释器都能安全输出中文。
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace', line_buffering=True)
    except Exception:
        pass
except Exception:
    pass

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
    # ③ 回写单元格底色：把每格填充色（solid fgColor.rgb 的后 6 位）一并带出，供端到端验证用。
    fills = []
    for row in ws.iter_rows():
        for c in row:
            try:
                if c.fill and c.fill.fgColor and c.fill.fill_type == 'solid' and c.fill.fgColor.rgb:
                    rgb = str(c.fill.fgColor.rgb)
                    if rgb and rgb not in ('00000000', '0'):
                        fills.append({'ref': c.coordinate, 'rgb': rgb[-6:]})
            except Exception:
                pass
    print(json.dumps({'columns': columns, 'rows': rows, 'fills': fills}, ensure_ascii=False))

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
    # 主键可能重复：row_of 只留最后一次出现，写回会全部落到那最后一行、首个重复行永远改不到。
    # 引擎的 preview.cells 已带 rowIndex（该行在 state.rows 里的下标，对应表体数据行 0-based），
    # 优先用它精确定位物理行（Excel 行号 = rowIndex + 2：+1 跳表头、+1 转 1-based）。
    # 无 rowIndex（旧调用/非引擎产物）时回落按主键值定位，保持向后兼容。
    for c in cells:
        col = c['col']
        if col not in header:
            header.append(col); ws.cell(row=1, column=len(header), value=col)
        ci = header.index(col) + 1
        ri = None
        if c.get('rowIndex') is not None:
            ri = int(c['rowIndex']) + 2
            if ri < 2 or ri > ws.max_row + 1:
                ri = None
        if ri is None:
            ri = row_of.get(str(c['row']))
        if ri is None: continue
        _set_cell(ws, ri, ci, c['after'])
        # ③ 回写单元格底色：cell 带 highlight（yellow/red/green/blue）时刷 PatternFill，只改填充色不改值。
        if c.get('highlight'):
            _set_fill(ws, ri, ci, c['highlight'])
    # 用户 m07859 图4：写回后 Excel 网格线变虚线 / 视觉与原表不同。
    # 根因：原表是 openpyxl 生成的，sheetView 里**没有** showGridLines（缺省），
    # 不同渲染器（WPS）缺省会画成虚线/浅灰网格。这里显式打开实线网格，保证写回后
    # 与「原表实线网格」一致；不改任何既有单元格样式（openpyxl load+save 保留 styles.xml 原字节）。
    try:
        ws.sheet_view.showGridLines = True
    except Exception:
        pass
    wb.save(path); print('OK')

def _set_cell(ws, ri, ci, value):
    from copy import copy
    cell = ws.cell(row=ri, column=ci)
    if cell.value is None and ri > 1:
        # 新数据格：继承同列表头下的第一条数据行的样式（若存在）
        ref = ws.cell(row=2, column=ci)
        try:
            cell.font = copy(ref.font); cell.border = copy(ref.border)
            cell.fill = copy(ref.fill); cell.number_format = ref.number_format
            cell.alignment = copy(ref.alignment)
        except Exception:
            pass
    cell.value = value


# highlight 底色映射：语义色 → 柔和 RGB（避免纯色刺眼）。openpyxl PatternFill fgColor 需 6 位十六进制。
_HIGHLIGHT_RGB = {
    'yellow': 'FFEB9C',  # 柔和黄
    'red': 'FFC7CE',     # 柔和红
    'green': 'C6EFCE',   # 柔和绿
    'blue': 'BDD7EE',    # 柔和蓝
}


def _set_fill(ws, ri, ci, color):
    """③ 回写单元格底色：给单元格刷 PatternFill（只改填充色，不动值/字体/边框）。未知色忽略。"""
    rgb = _HIGHLIGHT_RGB.get(str(color))
    if not rgb:
        return
    from openpyxl.styles import PatternFill
    ws.cell(row=ri, column=ci).fill = PatternFill(fill_type='solid', start_color=rgb, end_color=rgb)


def create(path, structure_json):
    """按结构清单建一张 xlsx（票 #52 空表 / #55 上传建表）。
    structure_json: {primaryKey, columns:{列名:类型}, name?, mode?, rows?:[{列名:值}]}。
    行为：写出表头（primaryKey 置首、其余列按清单顺序）；若 structure 带 rows（上传建表），
    逐行按表头顺序写入数据（缺列填空）。
    纯 IO，结构/数据合法性由 lib/engine.js 的 createTable/validateManifest/validateRows 保证（桥不判业务）。
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
    rows = structure.get('rows') or []
    if isinstance(rows, list):
        for r in rows:
            if not isinstance(r, dict):
                continue
            ws.append([('' if r.get(c) is None else r.get(c)) for c in header])
    # 用户 m07859 图4：新建表同样显式打开实线网格（缺省在部分渲染器下显示为虚线）。
    try:
        ws.sheet_view.showGridLines = True
    except Exception:
        pass
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

def sort(path, order_json):
    """按 order 数组（新行序，元素是表体数据行 0-based 下标）重排整表物理行顺序。
    行内容与单元格样式原样保留，只改行的先后。表头不动。
    order 语义与 lib/engine.js 的 preview.sortOrder 一致：order[k] = 原第几行数据被放到新第 k 行。
    """
    from openpyxl import load_workbook
    with open(order_json, encoding='utf-8') as f:
        order = json.load(f)
    wb = load_workbook(path); ws = wb.active
    n_data = ws.max_row - 1  # 表头占第 1 行
    if not isinstance(order, list) or len(order) != n_data:
        raise SystemExit('sort: order 长度 %r 与数据行数 %r 不符' % (
            len(order) if isinstance(order, list) else order, n_data))
    if sorted(order) != list(range(n_data)):
        raise SystemExit('sort: order 不是 0..%d 的排列' % (n_data - 1))
    ncol = ws.max_column
    # 读全量数据行到内存
    snapshot = []
    for k in range(n_data):
        src_row = k + 2
        row_vals = [ws.cell(row=src_row, column=c).value for c in range(1, ncol + 1)]
        snapshot.append(row_vals)
    # 按 order 回写（值）
    for new_k, old_k in enumerate(order):
        dst_row = new_k + 2
        vals = snapshot[old_k]
        for c in range(1, ncol + 1):
            ws.cell(row=dst_row, column=c).value = vals[c - 1]
    try:
        ws.sheet_view.showGridLines = True
    except Exception:
        pass
    wb.save(path); print('OK')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'init-main': init_main(sys.argv[2])
    elif cmd == 'init-source': init_source(sys.argv[2])
    elif cmd == 'read-xlsx': read_xlsx(sys.argv[2])
    elif cmd == 'read-values': read_values(sys.argv[2])
    elif cmd == 'read-csv': read_csv(sys.argv[2])
    elif cmd == 'apply': apply(sys.argv[2], sys.argv[3])
    elif cmd == 'sort': sort(sys.argv[2], sys.argv[3])
    elif cmd == 'create': create(sys.argv[2], sys.argv[3])
    elif cmd == 'probe': probe(sys.argv[2])
    else: raise SystemExit('unknown command: ' + cmd)
