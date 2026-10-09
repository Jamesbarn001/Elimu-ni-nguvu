// ============================================================
// tests/runner.js — Elingu 4-Tier Automated E2E Test Runner
// Supports tier selection (--tier 1,2,3,4), auto-spawns server if needed,
// outputs structured summary, and logs to docs/teamwork_exhaust/tests/.
// Exit codes: 0 = All Passed, 1 = Any Failure.
// ============================================================

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const testContext = require('./helpers/testContext');

// Parse CLI flags
const args = process.argv.slice(2);
function getArgValue(name, shortName) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name || args[i] === shortName) {
      return args[i + 1];
    }
    if (args[i].startsWith(`${name}=`)) {
      return args[i].split('=')[1];
    }
  }
  return null;
}

const tierArg = getArgValue('--tier', '-t');
const fileFilter = getArgValue('--file', '-f');
const bail = args.includes('--bail') || args.includes('-b');
const customPort = getArgValue('--port', '-p') || process.env.TEST_PORT || process.env.PORT || '3000';
process.env.TEST_PORT = customPort;
process.env.PORT = customPort;

const requestedTiers = tierArg
  ? tierArg.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
  : [1, 2, 3, 4];

const ROOT_DIR = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT_DIR, 'docs', 'teamwork_exhaust', 'tests');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

let serverProcess = null;
let serverSpawnedByRunner = false;

async function isServerRunning(port) {
  try {
    const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function startServerIfNeeded(port) {
  const alreadyRunning = await isServerRunning(port);
  if (alreadyRunning) {
    console.log(`📡 Connected to existing Elingu server on port ${port}.`);
    return;
  }

  console.log(`🚀 Spawning Elingu server on port ${port}...`);
  serverSpawnedByRunner = true;

  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: ROOT_DIR,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.on('error', (err) => {
    console.error('❌ Failed to start server process:', err.message);
  });

  // Wait for health check
  const start = Date.now();
  const timeoutMs = 25000;
  while (Date.now() - start < timeoutMs) {
    if (await isServerRunning(port)) {
      console.log(`✅ Server is healthy and listening on port ${port} (${Date.now() - start}ms)`);
      return;
    }
    await new Promise(r => setTimeout(r, 400));
  }

  throw new Error(`Timeout waiting for server to start on port ${port} after ${timeoutMs}ms.`);
}

function stopServer() {
  if (serverSpawnedByRunner && serverProcess) {
    try {
      console.log('\n🛑 Stopping test server...');
      serverProcess.kill('SIGTERM');
    } catch (e) {
      // ignore
    }
    serverProcess = null;
  }
}

process.on('SIGINT', () => {
  stopServer();
  process.exit(1);
});
process.on('SIGTERM', () => {
  stopServer();
  process.exit(1);
});

// Discover test files for a tier
function getTestFilesForTier(tierNum) {
  const dirName = tierNum === 1 ? 'tier1_features' :
                  tierNum === 2 ? 'tier2_boundaries' :
                  tierNum === 3 ? 'tier3_cross_portal' :
                  tierNum === 4 ? 'tier4_real_world' : null;

  if (!dirName) return [];
  const dirPath = path.join(__dirname, dirName);
  if (!fs.existsSync(dirPath)) return [];

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.test.js'))
    .map(f => path.join(dirPath, f));

  if (fileFilter) {
    return files.filter(f => f.toLowerCase().includes(fileFilter.toLowerCase()));
  }
  return files;
}

async function runSuite() {
  const startTime = Date.now();
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('🌲 ELINGU 4-TIER FULL-STACK E2E AUTOMATED TEST SUITE');
  console.log(`🎯 Active Tiers: [${requestedTiers.join(', ')}] | Port: ${customPort}`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  await startServerIfNeeded(customPort);

  const results = {
    startTime: new Date().toISOString(),
    tiers: {},
    totalTests: 0,
    totalPassed: 0,
    totalFailed: 0,
    failures: []
  };

  const logLines = [];
  function log(msg) {
    console.log(msg);
    logLines.push(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  for (const tier of requestedTiers) {
    const tierName = tier === 1 ? 'Tier 1: Feature Coverage (>=5 per feature)' :
                     tier === 2 ? 'Tier 2: Boundary & Corner Cases' :
                     tier === 3 ? 'Tier 3: Cross-Portal Synchronization' :
                     'Tier 4: Real-World Workload Scenarios';

    log(`\n┌───────────────────────────────────────────────────────────────────────┐`);
    log(`│ 📂 ${tierName.padEnd(67)} │`);
    log(`└───────────────────────────────────────────────────────────────────────┘`);

    const files = getTestFilesForTier(tier);
    results.tiers[tier] = { name: tierName, passed: 0, failed: 0, files: {} };

    if (files.length === 0) {
      log(`   ⚠️ No test files found for Tier ${tier}`);
      continue;
    }

    for (const file of files) {
      const fileName = path.basename(file);
      log(`\n  ▶ ${fileName}`);
      results.tiers[tier].files[fileName] = { passed: 0, failed: 0, tests: [] };

      let suiteExport = null;
      try {
        suiteExport = require(file);
      } catch (err) {
        log(`    ❌ Failed to load test file: ${err.message}`);
        results.totalFailed++;
        results.tiers[tier].failed++;
        results.failures.push({ tier, file: fileName, test: 'MODULE_LOAD', error: err.stack });
        if (bail) break;
        continue;
      }

      // If module exports an object of test functions
      if (typeof suiteExport === 'object' && suiteExport !== null) {
        const testNames = Object.keys(suiteExport);
        for (const testName of testNames) {
          const testFn = suiteExport[testName];
          if (typeof testFn !== 'function') continue;

          results.totalTests++;
          const t0 = Date.now();
          try {
            await testFn(testContext);
            const dur = Date.now() - t0;
            results.totalPassed++;
            results.tiers[tier].passed++;
            results.tiers[tier].files[fileName].passed++;
            results.tiers[tier].files[fileName].tests.push({ name: testName, status: 'PASS', durationMs: dur });
            log(`    ✓ ${testName} (${dur}ms)`);
          } catch (err) {
            const dur = Date.now() - t0;
            results.totalFailed++;
            results.tiers[tier].failed++;
            results.tiers[tier].files[fileName].failed++;
            results.tiers[tier].files[fileName].tests.push({ name: testName, status: 'FAIL', durationMs: dur, error: err.message });
            results.failures.push({ tier, file: fileName, test: testName, error: err.message, stack: err.stack });
            log(`    ✗ ${testName} (${dur}ms)`);
            log(`      🔴 ${err.message}`);
            if (bail) break;
          }
        }
      } else if (typeof suiteExport === 'function') {
        // Direct runner function
        results.totalTests++;
        const t0 = Date.now();
        try {
          await suiteExport(testContext);
          const dur = Date.now() - t0;
          results.totalPassed++;
          results.tiers[tier].passed++;
          results.tiers[tier].files[fileName].passed++;
          log(`    ✓ Suite completed successfully (${dur}ms)`);
        } catch (err) {
          const dur = Date.now() - t0;
          results.totalFailed++;
          results.tiers[tier].failed++;
          results.tiers[tier].files[fileName].failed++;
          results.failures.push({ tier, file: fileName, test: 'SUITE_FN', error: err.message, stack: err.stack });
          log(`    ✗ Suite execution failed (${dur}ms)`);
          log(`      🔴 ${err.message}`);
          if (bail) break;
        }
      }

      if (bail && results.totalFailed > 0) break;
    }

    if (bail && results.totalFailed > 0) break;
  }

  const durationTotalMs = Date.now() - startTime;
  results.durationTotalMs = durationTotalMs;
  results.endTime = new Date().toISOString();

  // Print Summary Table
  log('\n════════════════════════════════════════════════════════════════════════');
  log('📊 E2E EXECUTION SUMMARY');
  log('════════════════════════════════════════════════════════════════════════');
  for (const tier of requestedTiers) {
    const tData = results.tiers[tier];
    if (tData) {
      const passRate = (tData.passed + tData.failed) > 0 ? ((tData.passed / (tData.passed + tData.failed)) * 100).toFixed(1) : '0.0';
      log(`Tier ${tier}: ${tData.passed} Passed, ${tData.failed} Failed (${passRate}%) — ${tData.name}`);
    }
  }
  log('────────────────────────────────────────────────────────────────────────');
  log(`Total Tests Run:  ${results.totalTests}`);
  log(`Total Passed:     ${results.totalPassed} ✅`);
  log(`Total Failed:     ${results.totalFailed} ${results.totalFailed > 0 ? '❌' : ''}`);
  log(`Total Duration:   ${(durationTotalMs / 1000).toFixed(2)}s`);
  log('════════════════════════════════════════════════════════════════════════');

  if (results.failures.length > 0) {
    log('\n🚨 DETAILED FAILURES:');
    results.failures.forEach((f, idx) => {
      log(`  ${idx + 1}. [Tier ${f.tier}] [${f.file}] ${f.test}:`);
      log(`     ${f.error}`);
    });
  }

  // Write log and JSON to docs/teamwork_exhaust/tests/
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runLogPath = path.join(LOGS_DIR, `test_run_${timestamp}.log`);
  const runJsonPath = path.join(LOGS_DIR, `test_run_${timestamp}.json`);
  const latestLogPath = path.join(LOGS_DIR, 'latest.log');
  const latestJsonPath = path.join(LOGS_DIR, 'latest.json');

  fs.writeFileSync(runLogPath, logLines.join('\n'), 'utf8');
  fs.writeFileSync(runJsonPath, JSON.stringify(results, null, 2), 'utf8');
  fs.writeFileSync(latestLogPath, logLines.join('\n'), 'utf8');
  fs.writeFileSync(latestJsonPath, JSON.stringify(results, null, 2), 'utf8');

  log(`\n📄 Execution log written to: ${runLogPath}`);
  log(`📄 Execution JSON written to: ${runJsonPath}`);

  stopServer();

  if (results.totalFailed > 0) {
    log('\n❌ Test run failed. Exiting with code 1.');
    process.exit(1);
  } else {
    log('\n🎉 All tests passed successfully! Exiting with code 0.');
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('\n💥 Fatal runner error:', err);
  stopServer();
  process.exit(1);
});
