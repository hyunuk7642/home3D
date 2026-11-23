"""그림 폴더의 PNG 들을 데이터 주소로 묶어 posters.js / posters-hall.js 를 만든다.

사용: python3 tools/build-posters.py <PNG 폴더> <만들 파일> "<첫 줄 설명>"
"""
import base64
import json
import os
import sys

src, out, note = sys.argv[1], sys.argv[2], sys.argv[3]
names = sorted(n[:-4] for n in os.listdir(src) if n.endswith('.png'))
with open(out, 'w', encoding='utf-8') as f:
    f.write(f'// {note}\n// 더블클릭(file://)으로 열어도 3D 벽면에 쓸 수 있도록 그림을 파일이 아니라 데이터 주소로 담는다.\n')
    f.write('// 필요할 때만 불러오는, 자동으로 만든 파일.\nwindow.POSTERS = Object.assign(window.POSTERS || {}, {\n')
    for n in names:
        data = base64.b64encode(open(os.path.join(src, f'{n}.png'), 'rb').read()).decode()
        f.write(f"  {json.dumps(n)}: 'data:image/png;base64,{data}',\n")
    f.write('});\n')
print(len(names), '장 →', out, os.path.getsize(out), 'bytes')
