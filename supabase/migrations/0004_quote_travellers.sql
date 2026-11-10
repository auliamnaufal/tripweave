-- The names the traveller entered at checkout, stored with the quote they
-- paid for: suppliers book under them and e-tickets print them.
-- [{ "firstName": "Mara", "lastName": "Okafor", "email": "mara@example.com" }, ...]
alter table plan_quotes add column if not exists travellers jsonb;
