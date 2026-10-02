import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { db } from '../../core/db/schema';
import { platform } from '../../core/platform';
import { en } from '../../shared/i18n/en';
import { toast } from '../../shared/ui/toast';
import { addPdf } from './addPdf';
import { usePasswordPrompt } from './PasswordDialog';

export function LibraryPage() {
  const docs = useLiveQuery(() => db.documents.filter((d) => d.deletedAt === null).toArray(), []);
  const { prompt, dialog } = usePasswordPrompt();
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);

  async function add(files: File[]) {
    for (const file of files) {
      const r = await addPdf(file, prompt(file.name));
      if (r.kind === 'rejected') toast(en.library.rejected[r.reason](file.name));
      else if (r.kind === 'existing') {
        toast(en.library.existing(r.document.title));
        void navigate(`/read/${r.document.id}`); // same bytes: open the existing document (FR-LIB-02)
      } else toast(en.library.added(r.document.title));
    }
  }

  return (
    <div
      className={`min-h-full p-6 ${dragging ? 'outline-2 -outline-offset-8 outline-accent outline-dashed' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void add([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold">{en.library.title}</h1>
        <button
          className="ml-auto min-h-11 rounded-md bg-accent px-4 font-medium text-accent-fg"
          onClick={() => void platform.pickPdfFiles().then(add)}
        >
          {en.library.add}
        </button>
      </div>
      <p className="mt-2 hidden text-sm text-muted md:block">{en.library.dropHere}</p>
      <ul className="mt-6 flex flex-col gap-2">
        {docs?.map((d) => (
          <li key={d.id}>
            <Link to={`/read/${d.id}`} className="flex min-h-11 items-center underline-offset-2 hover:underline">
              {d.title}
            </Link>
          </li>
        ))}
      </ul>
      {dialog}
    </div>
  );
}
