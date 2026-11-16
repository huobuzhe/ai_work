# -*- coding: utf-8 -*-
"""本地 xlsx/csv 桥：只做「读写文件」，不含任何业务逻辑。
票 #9 端到端验收用；纯引擎（lib/engine.js）完全不知道这个文件存在。
子命令：
  init-main <path>    生成主表（5 员工，无邮箱列）
  init-source <path>  生成来源 CSV（姓名/邮箱）
  read-xlsx <path>    打印 JSON {columns, rows}
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

def read_xlsx(path):
    from openpyxl import load_workbook
    ws = load_workbook(path).active
    grid = [[c.value for c in row] for row in ws.iter_rows()]
    if not grid:
        print(json.dumps({'columns': [], 'rows': []}, ensure_ascii=False)); return
    columns = [('' if v is None else str(v)) for v in grid[0]]
    rows = []
    for r in grid[1:]:
        if all(v is None for v in r): continue
        rows.append({columns[i]: ('' if i >= len(r) or r[i] is None else r[i]) for i in range(len(columns))})
    print(json.dumps({'columns': columns, 'rows': rows}, ensure_ascii=False))

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

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'init-main': init_main(sys.argv[2])
    elif cmd == 'init-source': init_source(sys.argv[2])
    elif cmd == 'read-xlsx': read_xlsx(sys.argv[2])
    elif cmd == 'read-csv': read_csv(sys.argv[2])
    elif cmd == 'apply': apply(sys.argv[2], sys.argv[3])
    else: raise SystemExit('unknown command: ' + cmd)
