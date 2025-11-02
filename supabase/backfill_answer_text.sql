-- Populate the questions.answer_text column for existing records.
-- This script preserves any non-empty answer_text values and only fills
-- rows where the column is null or blank, using the choice string
-- referenced by answer_index.
update public.questions
set answer_text = nullif(btrim(choices ->> answer_index), '')
where coalesce(btrim(answer_text), '') = ''
  and jsonb_typeof(choices) = 'array'
  and answer_index between 0 and coalesce(jsonb_array_length(choices) - 1, -1);
