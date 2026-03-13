const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
    process.exit(1);
}

fetch(`${supabaseUrl}/rest/v1/audit_logs?limit=1`, {
    headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
    }
})
    .then(res => res.json())
    .then(data => console.log(JSON.stringify(data, null, 2)))
    .catch(console.error);
