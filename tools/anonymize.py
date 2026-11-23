"""아티팩트에서 받은 각 장(*.dc.html)의 교사 이름을 OOO 으로 바꾼 사본을 만든다.

사용: python3 tools/anonymize.py <받은 장이 있는 폴더> <사본을 둘 빈 폴더>

연구회 장(room*.dc.html)의 맨 아래 이름 줄만 바꾼다. 학교 이름과 교과 구분은 그대로 둔다.
끝에 '아직 남은 이름'이 비어 있는지 확인할 것.
"""
import glob
import os
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
KEEP = {'정보', '컴퓨터', '물리', '지구과학', '연구진', '이름'}
names = set()


def anon(line):
    out = []
    for part in re.split(r'(\([^)]*\))', line):
        if part.startswith('('):
            inner = part[1:-1]
            # 괄호 안이 2~3자이고 학교(초·중·고)로 끝나지 않으면 사람 이름으로 본다
            if re.fullmatch(r'[가-힣]{2,3}', inner) and inner[-1] not in '초중고':
                names.add(inner)
                part = '(OOO)'
            out.append(part)
            continue

        def repl(m):
            w = m.group(0)
            if w in KEEP or (len(w) >= 4 and w[-1] in '초중고') or len(w) > 4:
                return w
            names.add(w)
            return 'OOO'

        out.append(re.sub(r'[가-힣]+', repl, part))
    return ''.join(out)


NAME_LINE = re.compile(r'(<div style="font-size: 12\.5px; line-height: 1\.6; color: #3E3E3E">)(.*?)(</div>)')
os.makedirs(dst, exist_ok=True)
for path in sorted(glob.glob(os.path.join(src, '*.dc.html'))):
    name = os.path.basename(path)
    text = open(path, encoding='utf-8').read()
    if name.startswith('room'):
        text, count = NAME_LINE.subn(lambda m: m.group(1) + anon(m.group(2)) + m.group(3), text)
        assert count == 1, f'{name}: 이름 줄을 찾지 못했다'
        print(name, '→', NAME_LINE.search(text).group(2))
    open(os.path.join(dst, name), 'w', encoding='utf-8').write(text)

left = {}
for path in glob.glob(os.path.join(dst, '*.dc.html')):
    text = open(path, encoding='utf-8').read()
    for n in names:
        if len(n) >= 3 and n in text:
            left.setdefault(n, []).append(os.path.basename(path))
print(f'바꾼 이름 {len(names)}개 · 아직 남은 이름: {left}')
