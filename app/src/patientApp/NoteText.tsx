// Testo di un'indicazione generale: paragrafi ed elenchi puntati. Condiviso tra app desktop e app paziente.

/** Paragrafi ed elenchi puntati (righe che iniziano con "- " o "•"). */
export function NoteText({ text, className = '' }: { text: string; className?: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-•–]\s+/.test(line) || /^\d+[).]\s+/.test(line);
    const last = blocks[blocks.length - 1];
    if (last && last.list === bullet && bullet) last.lines.push(line.replace(/^([-•–]|\d+[).])\s+/, ''));
    else blocks.push({ list: bullet, lines: [bullet ? line.replace(/^([-•–]|\d+[).])\s+/, '') : line] });
  }
  return (
    <div className={'flex flex-col gap-1.5 [text-wrap:pretty] ' + className}>
      {blocks.map((b, i) => b.list
        ? <ul key={i} className="m-0 pl-5 flex flex-col gap-0.5 list-disc marker:text-[#8A928F]">{b.lines.map((l, k) => <li key={k}>{l}</li>)}</ul>
        : <p key={i} className="m-0">{b.lines[0]}</p>)}
    </div>
  );
}
