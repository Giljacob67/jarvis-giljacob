import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function generateEmbedding(text: string): Promise<number[]> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/text-embedding-004",
      input: text.slice(0, 8000),
    }),
  });

  if (!resp.ok) throw new Error(`Embedding failed: ${resp.status}`);
  const data = await resp.json();
  return data.data?.[0]?.embedding || [];
}

async function extractTextFromPDF(fileBuffer: ArrayBuffer): Promise<string> {
  // Simple text extraction from PDF - looks for text streams
  const bytes = new Uint8Array(fileBuffer);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  
  // Extract text between BT/ET blocks (PDF text objects)
  const textParts: string[] = [];
  const regex = /\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const decoded = match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (decoded.length > 2 && /[a-zA-ZÀ-ÿ]/.test(decoded)) {
      textParts.push(decoded);
    }
  }
  
  return textParts.join(" ").replace(/\s+/g, " ").trim();
}

function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) { // Skip very small chunks
      chunks.push(chunk);
    }
    start += chunkSize - overlap;
  }
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { document_id } = await req.json();
    const authHeader = req.headers.get("Authorization");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get document record
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", document_id)
      .eq("user_id", user.id)
      .single();

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download file from storage
    const { data: fileData, error: storageError } = await supabase.storage
      .from("documents")
      .download(doc.file_path);

    if (storageError || !fileData) {
      await supabase.from("documents").update({ status: "error" }).eq("id", document_id);
      return new Response(JSON.stringify({ error: "Failed to download file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract text based on MIME type
    let extractedText = "";
    const buffer = await fileData.arrayBuffer();

    if (doc.mime_type === "application/pdf") {
      extractedText = await extractTextFromPDF(buffer);
    } else if (doc.mime_type.startsWith("text/") || doc.mime_type === "application/json") {
      extractedText = new TextDecoder().decode(buffer);
    } else {
      // For other types, try plain text decode
      extractedText = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    }

    if (!extractedText || extractedText.length < 20) {
      // Use LLM to attempt OCR-like extraction as fallback
      await supabase.from("documents").update({ status: "no_text", chunk_count: 0 }).eq("id", document_id);
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Documento processado mas texto não pôde ser extraído. Formatos suportados: PDF (com texto), TXT, MD, JSON.",
        chunks: 0 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chunk the text
    const chunks = chunkText(extractedText);

    // Generate embeddings and insert chunks
    let successCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      try {
        const embedding = await generateEmbedding(chunks[i]);
        if (embedding.length > 0) {
          await supabase.from("document_chunks").insert({
            document_id: doc.id,
            user_id: user.id,
            chunk_index: i,
            content: chunks[i],
            embedding: embedding,
          });
          successCount++;
        }
      } catch (e) {
        console.error(`Error processing chunk ${i}:`, e);
      }
    }

    // Update document status
    await supabase.from("documents").update({
      status: "ready",
      chunk_count: successCount,
      updated_at: new Date().toISOString(),
    }).eq("id", document_id);

    // Log the activity
    await supabase.from("activity_logs").insert({
      user_id: user.id,
      action_type: "document_processed",
      title: `Documento processado: ${doc.name}`,
      description: `${successCount} trechos indexados para busca semântica`,
      status: "success",
      metadata: { document_id: doc.id, chunks: successCount },
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Documento "${doc.name}" processado: ${successCount} trechos indexados.`,
      chunks: successCount 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-document error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
