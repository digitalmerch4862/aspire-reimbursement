
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkMaxId() {
    const { data, error } = await supabase
        .from('audit_logs')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);

    if (error) {
        console.error("Select Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Max ID Data:", JSON.stringify(data, null, 2));
    }
}

checkMaxId();
