export interface Note {
  id: number;
  title: string;
  body: string;
  updatedAt: string;
}

export interface NoteInput {
  title?: string;
  body?: string;
}

export const NOTE_TITLE_MAX_LENGTH = 80;
export const NOTE_BODY_MAX_LENGTH = 50_000;
export const NOTES_MAX = 300;
