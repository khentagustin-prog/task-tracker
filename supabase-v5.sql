-- I-run sa Supabase SQL Editor (para sa mga group sa loob ng board)
alter table tasks add column if not exists section text;
