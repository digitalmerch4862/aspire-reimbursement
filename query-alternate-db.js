
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkToday() {
    console.log("Checking configured Supabase project for records today...");
    const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .gte('created_at', '2026-03-03T00:00:00Z')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Found records in audit_logs:", data.length);
        if (data.length > 0) {
            console.log(JSON.stringify(data.slice(0, 5), null, 2));
        }
    }

    const { data: data2, error: error2 } = await supabase
        .from('reimbursement_logs')
        .select('*')
        .gte('created_at', '2026-03-03T00:00:00Z')
        .order('created_at', { ascending: false });

    if (error2) {
        console.error("Error 2:", error2);
    } else {
        console.log("Found records in reimbursement_logs:", data2.length);
        if (data2.length > 0) {
            console.log(JSON.stringify(data2.slice(0, 5), null, 2));
        }
    }
}

checkToday();
