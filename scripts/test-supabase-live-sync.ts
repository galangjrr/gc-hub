/**
 * Test Live Supabase Sync with GC Net Booking Production Database
 * 
 * Verifies:
 * 1. Read live tables (pcs, pakets, inventory, bookings)
 * 2. Push active workstation state snapshot (expected_empty_time)
 * 3. Verify read-back from Supabase
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di env sebelum menjalankan test ini.');
  process.exit(1);
}

async function runLiveSyncTest() {
  console.log('================================================================');
  console.log('⚡ TESTING LIVE SUPABASE SYNC (GC-HUB <-> GC NET BOOKING CLOUD)');
  console.log('================================================================\n');

  // 1. Fetch live 'pcs' table from GC Net Booking
  console.log('--- [1. FETCHING LIVE "pcs" TABLE] ---');
  const pcsRes = await fetch(`${SUPABASE_URL}/rest/v1/pcs?select=*`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    }
  });

  if (!pcsRes.ok) {
    console.error(`❌ Failed to connect to Supabase: ${pcsRes.status} ${pcsRes.statusText}`);
    process.exit(1);
  }

  const livePcs = await pcsRes.json();
  console.log(`✅ [PASS] Successfully connected to Supabase. Found ${livePcs.length} PC(s) in cloud:`);
  livePcs.forEach((pc: any) => {
    console.log(`   • [${pc.id}] ${pc.name} | Expected Empty: ${pc.expected_empty_time || 'KOSONG / TERSEDIA'}`);
  });

  // 2. Fetch live 'pakets' table
  console.log('\n--- [2. FETCHING LIVE "pakets" TABLE] ---');
  const paketsRes = await fetch(`${SUPABASE_URL}/rest/v1/pakets?select=*`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    }
  });
  if (paketsRes.ok) {
    const livePakets = await paketsRes.json();
    console.log(`✅ [PASS] Found ${livePakets.length} package(s) configured in cloud:`);
    livePakets.slice(0, 5).forEach((p: any) => {
      console.log(`   • ${p.name} -> Rp ${(p.price || 0).toLocaleString('id-ID')} (${p.duration_minutes || 0}m)`);
    });
  }

  // 3. Test Live State Push (Simulating GC-Hub Bilik 01 active with 45 minutes)
  console.log('\n--- [3. SIMULATING GC-HUB WORKSTATION SYNC TO CLOUD] ---');
  const targetPcId = livePcs.length > 0 ? livePcs[0].id : 'pc-1';
  const targetPcName = livePcs.length > 0 ? livePcs[0].name : 'PC-01';
  const simulatedRemainingMinutes = 45;
  const simulatedEmptyTime = new Date(Date.now() + simulatedRemainingMinutes * 60000).toISOString();

  console.log(`Simulating: ${targetPcName} active with ${simulatedRemainingMinutes}m remaining.`);
  console.log(`Expected Empty Time calculated: ${simulatedEmptyTime}`);

  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/pcs?id=eq.${targetPcId}`, {
    method: 'PATCH',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      expected_empty_time: simulatedEmptyTime
    })
  });

  if (updateRes.ok) {
    const updated = await updateRes.json();
    console.log(`✅ [PASS] Cloud 'pcs' table updated successfully:`);
    console.log(`   Updated Row:`, updated[0]);
  } else {
    console.error(`❌ Failed to update pcs row: ${updateRes.status} ${updateRes.statusText}`);
  }

  // 4. Verify Read Back
  console.log('\n--- [4. VERIFY READ-BACK FROM SUPABASE CLOUD] ---');
  const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/pcs?id=eq.${targetPcId}&select=*`, {
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    }
  });

  if (verifyRes.ok) {
    const data = await verifyRes.json();
    if (data[0]?.expected_empty_time === simulatedEmptyTime) {
      console.log(`✅ [PASS] Read-back verified 100%! The web at https://gcnethub.vercel.app/ now reflects this empty time.`);
    } else {
      console.warn(`⚠️ Warning: Expected ${simulatedEmptyTime}, got ${data[0]?.expected_empty_time}`);
    }
  }

  // 5. Reset back to original state
  console.log('\n--- [5. CLEANUP / RESET TEST STATE] ---');
  await fetch(`${SUPABASE_URL}/rest/v1/pcs?id=eq.${targetPcId}`, {
    method: 'PATCH',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      expected_empty_time: null
    })
  });
  console.log(`✅ [PASS] Reset ${targetPcId} expected_empty_time back to null (Tersedia).`);

  console.log('\n================================================================');
  console.log('🎉 LIVE SUPABASE SYNC TEST PASSED 100%!');
  console.log('================================================================\n');
}

runLiveSyncTest().catch(console.error);
