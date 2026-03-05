

## Plan: File Upload via Chat (Drag-and-Drop, Paste, and Attach Button)

### What We'll Build
Add the ability to attach files directly in the chat input area via:
1. **Drag & drop** files onto the chat area
2. **Paste** files from clipboard (Ctrl+V / Cmd+V)
3. **Attach button** (paperclip icon) next to the text input

Files will be uploaded to the existing `documents` storage bucket, processed via the `process-document` edge function, and a user message will be sent to Jarvis referencing the file so he can use RAG search on it.

### Technical Approach

**1. Chat UI Changes (`src/pages/Chat.tsx`)**
- Add state for attached files (`pendingFiles: File[]`)
- Add a hidden `<input type="file">` triggered by a paperclip button
- Add `onDragOver`/`onDrop` handlers on the chat container for drag-and-drop with a visual overlay ("Solte o arquivo aqui")
- Add `onPaste` handler on the text input to capture pasted files from clipboard
- Show file preview chips below the input (filename + remove button)
- On send: upload files to `documents` bucket, insert into `documents` table, call `process-document`, then send the message with file context (e.g., "📎 Arquivo enviado: filename.pdf")

**2. Upload Logic**
- Reuse the same upload pattern from `Files.tsx`: upload to `supabase.storage.from("documents")`, insert row into `documents` table, then invoke `process-document`
- Extract this into a shared helper or inline it in Chat.tsx
- Accept common file types: PDF, TXT, MD, JSON, images, DOCX
- Max file size: 10MB per file

**3. Visual Elements**
- Paperclip/attach icon (`Paperclip` from lucide) added to the input bar
- Drag overlay: semi-transparent overlay with dashed border when dragging files over the chat
- File chips: small rounded pills showing filename + X button to remove before sending
- Upload progress indicator (spinner on the chip while uploading)

**4. No database changes needed** — the `documents` table and `documents` storage bucket already exist.

### Files to Modify
- `src/pages/Chat.tsx` — main changes (drag/drop, paste, attach button, upload logic, file chips)

