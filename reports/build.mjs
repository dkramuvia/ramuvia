// 진행 보고서 Markdown → Word(.docx)
//   node build.mjs 2026-09-28        → out/라무핀_진행보고_2026-09-28.docx
// 지원 문법: # 제목, 문단, **굵게**, - 목록(2단계), 1. 번호 목록, 표, > 강조 박스, --- 쪽 나눔, ![설명](images/...png)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { marked } from 'marked';

const here = dirname(fileURLToPath(import.meta.url));
const date = process.argv[2];
if (!date) {
  console.error('사용법: node build.mjs 2026-09-28');
  process.exit(1);
}
const source = join(here, `${date}.md`);
if (!existsSync(source)) {
  console.error(`${source} 파일이 없습니다`);
  process.exit(1);
}

const FONT = '맑은 고딕';
const COLORS = { title: '2B2320', accent: '0095FF', muted: '6B6B6B', tableHead: 'EFEAE6', note: 'F3F8FF', border: 'D9D9D9' };
/** 상태 글자에 색 입히기 (표에서 한눈에 보이게) */
const STATUS_COLORS = { 완료: '1E9E4A', 정상: '1E9E4A', 진행: '0077CC', 예정: '6B6B6B', 주의: 'D98A00', 지연: 'D93025', 대기: 'D98A00' };

// ─── 인라인 (굵게·링크·코드) ───
function inlineRuns(tokens = [], base = {}) {
  const runs = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'strong':
        runs.push(...inlineRuns(t.tokens, { ...base, bold: true }));
        break;
      case 'em':
        runs.push(...inlineRuns(t.tokens, { ...base, italics: true }));
        break;
      case 'codespan':
        runs.push(new TextRun({ ...base, text: t.text, font: 'Consolas' }));
        break;
      case 'link':
        runs.push(...inlineRuns(t.tokens, { ...base, color: COLORS.accent, underline: {} }));
        break;
      case 'br':
        runs.push(new TextRun({ ...base, break: 1 }));
        break;
      case 'text':
      case 'escape':
        if (t.tokens) runs.push(...inlineRuns(t.tokens, base));
        else runs.push(new TextRun({ ...base, text: decode(t.text) }));
        break;
      case 'image':
        break; // 이미지는 문단 단위에서 처리
      default:
        if (t.text) runs.push(new TextRun({ ...base, text: decode(t.text) }));
    }
  }
  return runs;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** 이미지들을 한 줄에 나란히 (폰 화면 캡처는 여러 장을 옆으로) */
function imageParagraph(images) {
  const children = [];
  const maxHeight = images.length > 1 ? 300 : 360;
  for (const img of images) {
    const file = resolve(here, img.href);
    if (!existsSync(file)) {
      children.push(new TextRun({ text: `[이미지 없음: ${img.href}] `, color: 'D93025' }));
      continue;
    }
    const data = readFileSync(file);
    const { width, height } = pngSize(data);
    const scale = maxHeight / height;
    children.push(new ImageRun({ type: 'png', data, transformation: { width: Math.round(width * scale), height: maxHeight } }));
    children.push(new TextRun({ text: '   ' }));
  }
  const captions = images.map((i) => i.text).filter(Boolean).join('  /  ');
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120 }, children }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: captions, size: 18, color: COLORS.muted })] }),
  ];
}

function cellParagraph(cell, isHeader) {
  const runs = inlineRuns(cell.tokens, isHeader ? { bold: true } : {});
  const plain = cell.text.trim();
  const color = STATUS_COLORS[plain];
  if (color && !isHeader) return new Paragraph({ children: [new TextRun({ text: plain, bold: true, color })] });
  return new Paragraph({ children: runs });
}

function table(token) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: COLORS.border };
  const borders = { top: border, bottom: border, left: border, right: border };
  const makeRow = (cells, isHeader) =>
    new TableRow({
      tableHeader: isHeader,
      children: cells.map(
        (cell) =>
          new TableCell({
            borders,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            shading: isHeader ? { type: ShadingType.CLEAR, fill: COLORS.tableHead, color: 'auto' } : undefined,
            children: [cellParagraph(cell, isHeader)],
          }),
      ),
    });
  return [
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [makeRow(token.header, true), ...token.rows.map((r) => makeRow(r, false))] }),
    new Paragraph({ spacing: { after: 120 } }),
  ];
}

function list(token, level = 0) {
  const out = [];
  for (const item of token.items) {
    for (const child of item.tokens) {
      if (child.type === 'list') out.push(...list(child, level + 1));
      else if (child.type === 'text' || child.type === 'paragraph') {
        out.push(
          new Paragraph({
            children: inlineRuns(child.tokens ?? [{ type: 'text', text: child.text }]),
            numbering: { reference: token.ordered ? 'numbers' : 'bullets', level },
            spacing: { after: 60 },
          }),
        );
      }
    }
  }
  return out;
}

function blocks(tokens) {
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'heading': {
        const heading = [HeadingLevel.TITLE, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][t.depth - 1] ?? HeadingLevel.HEADING_3;
        out.push(new Paragraph({ heading, children: inlineRuns(t.tokens) }));
        break;
      }
      case 'paragraph': {
        const images = t.tokens.filter((x) => x.type === 'image');
        if (images.length) out.push(...imageParagraph(images));
        else out.push(new Paragraph({ children: inlineRuns(t.tokens), spacing: { after: 120 } }));
        break;
      }
      case 'list':
        out.push(...list(t));
        break;
      case 'table':
        out.push(...table(t));
        break;
      case 'blockquote':
        for (const inner of t.tokens) {
          if (inner.type !== 'paragraph') continue;
          out.push(
            new Paragraph({
              children: inlineRuns(inner.tokens),
              shading: { type: ShadingType.CLEAR, fill: COLORS.note, color: 'auto' },
              border: { left: { style: BorderStyle.SINGLE, size: 18, color: COLORS.accent, space: 8 } },
              spacing: { before: 80, after: 160 },
              indent: { left: 120 },
            }),
          );
        }
        break;
      case 'hr':
        out.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      default:
        break;
    }
  }
  return out;
}

const markdown = readFileSync(source, 'utf8');
const doc = new Document({
  creator: '라무비아 개발',
  title: `라무핀 진행 보고 ${date}`,
  styles: {
    default: { document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { line: 300 } } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', run: { font: FONT, size: 40, bold: true, color: COLORS.title }, paragraph: { spacing: { after: 120 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 30, bold: true, color: COLORS.title }, paragraph: { spacing: { before: 360, after: 160 } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 25, bold: true, color: COLORS.title }, paragraph: { spacing: { before: 240, after: 120 } } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 22, bold: true }, paragraph: { spacing: { before: 160, after: 80 } } },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [0, 1, 2].map((level) => ({
          level,
          format: LevelFormat.BULLET,
          text: ['•', '◦', '▪'][level],
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400 + level * 400, hanging: 260 } } },
        })),
      },
      {
        reference: 'numbers',
        levels: [0, 1].map((level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 400 + level * 400, hanging: 300 } } },
        })),
      },
    ],
  },
  sections: [
    {
      properties: { page: { margin: { top: 1200, bottom: 1200, left: 1200, right: 1200 } } },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `라무핀 진행 보고 ${date}  ·  `, size: 16, color: COLORS.muted }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLORS.muted })],
            }),
          ],
        }),
      },
      children: blocks(marked.lexer(markdown)),
    },
  ],
});

mkdirSync(join(here, 'out'), { recursive: true });
// 파일 이름은 문서 첫 제목(# ...)에서 가져옵니다. 진행 보고 외에 결정 요청 같은 문서도 만들 수 있게
const firstHeading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '진행보고';
const safeName = firstHeading.replace(/[\/:*?"<>|]/g, '').replace(/\s+/g, '_');
const target = join(here, 'out', `라무핀_${safeName}_${date}.docx`);
writeFileSync(target, await Packer.toBuffer(doc));
console.log(`생성: ${target}`);
