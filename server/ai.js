import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = 30000;

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function aiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function mimeFor(filePath) {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'image/jpeg';
}

function toNumber(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(n, max) * 10) / 10;
}

/**
 * Minta estimasi kalori & protein dari foto makanan.
 * Mengembalikan { foodName, calories, proteinG }.
 */
export async function analyzeMealPhoto({ filePath, mealLabel }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY belum diset.');
  }

  const buffer = await fs.readFile(filePath);
  const dataUrl = `data:${mimeFor(filePath)};base64,${buffer.toString('base64')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 250,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Kamu ahli gizi yang memperkirakan kandungan makanan dari foto. ' +
              'Jawab HANYA dengan JSON valid tanpa markdown.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  `Perkirakan untuk makanan ${mealLabel} pada foto ini. ` +
                  'Jumlahkan semua item yang terlihat. Balas JSON dengan format: ' +
                  '{"food":"deskripsi singkat makanan","calories":angka_kkal,"protein_g":angka_gram}',
              },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const trimmed = detail.replace(/\s+/g, ' ').slice(0, 300);
      const error = new Error(`OpenAI ${response.status}: ${trimmed || 'permintaan gagal'}`);
      error.status = response.status;
      throw error;
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content ?? '';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }

    const calories = toNumber(parsed?.calories, 5000);
    const proteinG = toNumber(parsed?.protein_g, 500);
    if (calories === null || proteinG === null) {
      throw new Error('AI tidak mengembalikan angka kalori/protein yang valid.');
    }

    const foodName = String(parsed?.food ?? '').trim().slice(0, 160) || null;
    return { foodName, calories, proteinG };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Analisis AI melebihi batas waktu.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
