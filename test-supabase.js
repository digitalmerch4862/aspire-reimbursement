
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hbohvskvyiagqxyiofzn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhib2h2c2t2eWlhZ3F4eWlvZnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNjY0MDgsImV4cCI6MjA4Njc0MjQwOH0.2pBiXK1CF-MHXO8ZHai9owJ4yPihGMU_gOQc53Me3D0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testExplicitInsert() {
    const randomCode = 'TEST-EXP-' + Math.floor(Math.random() * 100000);
    console.log("Testing Supabase Explicit ID Insert with code:", randomCode);

    const payload = {
        id: 9999,
        staff_name: 'Test User Explicit',
        amount: 10.50,
        nab_code: randomCode,
        full_email_content: 'Test content explicit',
        created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('audit_logs')
        .insert([payload])
        .select();

    if (error) {
        console.error("Insert Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Insert Success:", data);
    }
}

testExplicitInsert();
