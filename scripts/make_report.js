#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read metadata
const metaPath = path.join(__dirname, '..', 'docs', 'csv_results_meta.json');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

// Read all scenario results
const scenarios = [];
for (let i = 0; i < meta.scenarios.length; i++) {
  const scenario = meta.scenarios[i];
  const casePath = path.join(__dirname, '..', 'docs', `csv_case_${scenario.case}.json`);
  try {
    const caseData = JSON.parse(fs.readFileSync(casePath, 'utf8'));
    scenarios.push({
      ...scenario,
      results: caseData.results || [],
      error: caseData.error
    });
  } catch (e) {
    scenarios.push({
      ...scenario,
      results: [],
      error: 'Failed to load results'
    });
  }
}

// Generate HTML report
const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LLM Matching CSV Test Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        
        .mode-banner {
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 18px;
            font-weight: bold;
            text-align: center;
        }
        
        .mode-live {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        
        .mode-mock {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
        }
        
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        h1 {
            margin: 0 0 10px 0;
            color: #333;
        }
        
        .timestamp {
            color: #666;
            font-size: 14px;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        
        .summary-card {
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .summary-card h3 {
            margin: 0 0 10px 0;
            color: #667eea;
            font-size: 14px;
            text-transform: uppercase;
        }
        
        .summary-card .value {
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }
        
        .scenario {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .scenario-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
        }
        
        .scenario-title {
            font-size: 18px;
            font-weight: bold;
            color: #333;
        }
        
        .scenario-meta {
            display: flex;
            gap: 20px;
            font-size: 14px;
            color: #666;
        }
        
        .latency {
            padding: 4px 8px;
            border-radius: 4px;
            background: #e0f2fe;
            color: #0369a1;
            font-weight: 500;
        }
        
        .results-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        
        .results-table th {
            background: #f8f9fa;
            padding: 10px;
            text-align: left;
            font-weight: 600;
            color: #495057;
            border-bottom: 2px solid #dee2e6;
        }
        
        .results-table td {
            padding: 10px;
            border-bottom: 1px solid #e9ecef;
        }
        
        .results-table tr:hover {
            background: #f8f9fa;
        }
        
        .score {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            background: #d4edda;
            color: #155724;
            font-weight: 500;
            font-size: 13px;
        }
        
        .reason {
            color: #666;
            font-size: 13px;
            max-width: 500px;
        }
        
        .no-results {
            padding: 20px;
            text-align: center;
            color: #999;
            font-style: italic;
        }
        
        .safety-note {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        
        .safety-note h3 {
            margin: 0 0 10px 0;
            color: #856404;
        }
        
        .safety-note ul {
            margin: 5px 0;
            padding-left: 20px;
        }
        
        .artifacts-section {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-top: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .artifacts-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 10px;
            margin-top: 15px;
        }
        
        .artifact-link {
            padding: 8px 12px;
            background: #f8f9fa;
            border-radius: 4px;
            text-decoration: none;
            color: #0066cc;
            transition: background 0.2s;
        }
        
        .artifact-link:hover {
            background: #e9ecef;
        }
    </style>
</head>
<body>
    <div class="mode-banner ${meta.mode === 'LIVE' ? 'mode-live' : 'mode-mock'}">
        ${meta.mode === 'LIVE' 
            ? '🚀 LIVE MODE - Azure OpenAI API' 
            : '🧪 MOCK MODE - Local Fallback'}
        ${meta.mode === 'LIVE' && process.env.AZURE_OPENAI_DEPLOYMENT 
            ? ` (Deployment: ${process.env.AZURE_OPENAI_DEPLOYMENT.substring(0, 8)}...)` 
            : ''}
    </div>
    
    <div class="header">
        <h1>LLM Matching CSV Test Report</h1>
        <div class="timestamp">Generated: ${new Date(meta.timestamp).toLocaleString()}</div>
    </div>
    
    <div class="summary-grid">
        <div class="summary-card">
            <h3>Total Scenarios</h3>
            <div class="value">${scenarios.length}</div>
        </div>
        <div class="summary-card">
            <h3>Average Latency</h3>
            <div class="value">${Math.round(scenarios.reduce((sum, s) => sum + s.latency_ms, 0) / scenarios.length)}ms</div>
        </div>
        <div class="summary-card">
            <h3>Total Matches</h3>
            <div class="value">${scenarios.reduce((sum, s) => sum + (s.count || 0), 0)}</div>
        </div>
        <div class="summary-card">
            <h3>Mode</h3>
            <div class="value">${meta.mode}</div>
        </div>
    </div>
    
    ${scenarios.map(scenario => `
        <div class="scenario">
            <div class="scenario-header">
                <div class="scenario-title">Scenario ${scenario.case}: ${scenario.description}</div>
                <div class="scenario-meta">
                    <span>City: <strong>${scenario.city}</strong></span>
                    <span class="latency">${scenario.latency_ms}ms</span>
                    <span>Matches: <strong>${scenario.count || 0}</strong></span>
                </div>
            </div>
            
            ${scenario.error ? `
                <div class="no-results">Error: ${scenario.error}</div>
            ` : scenario.results && scenario.results.length > 0 ? `
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Score</th>
                            <th>Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${scenario.results.slice(0, 5).map((result, idx) => `
                            <tr>
                                <td>#${idx + 1}</td>
                                <td>${result.id}</td>
                                <td>${result.name || 'N/A'}</td>
                                <td><span class="score">${(result.score || 0).toFixed(3)}</span></td>
                                <td class="reason">${result.reason || 'No reason provided'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : `
                <div class="no-results">No matches found</div>
            `}
        </div>
    `).join('')}
    
    <div class="safety-note">
        <h3>🔒 Safety & Security Notes</h3>
        <ul>
            <li>API keys and sensitive credentials are masked in logs (never exposed)</li>
            <li>Request/response payloads are truncated to 500 chars in logs</li>
            <li>No PII (phone, email) is sent to the LLM</li>
            <li>CSV data is anonymized with generic nurse IDs</li>
            <li>All coordinates use city centroids, not exact addresses</li>
        </ul>
    </div>
    
    <div class="artifacts-section">
        <h3>📁 Raw JSON Artifacts</h3>
        <div class="artifacts-list">
            ${scenarios.map(s => `
                <a href="csv_case_${s.case}.json" class="artifact-link">
                    csv_case_${s.case}.json
                </a>
            `).join('')}
            <a href="csv_results_meta.json" class="artifact-link">
                csv_results_meta.json
            </a>
        </div>
    </div>
</body>
</html>`;

// Write HTML report
const reportPath = path.join(__dirname, '..', 'docs', 'report.html');
fs.writeFileSync(reportPath, html);

console.log(`✓ HTML report generated: ${reportPath}`);
console.log(`Mode: ${meta.mode}`);