
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hbohvskvyiagqxyiofzn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhib2h2c2t2eWlhZ3F4eWlvZnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjY0MDgsImV4cCI6MjA4Njc0MjQwOH0.2pBiXK1CF-MHXO8ZHai9owJ4yPihGMU_gOQc53Me3D0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkToday() {
    console.log("Checking project hbohvskvyiagqxyiofzn for records today...");
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
