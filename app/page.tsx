'use client'

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { callAIAgent, uploadFiles } from '@/lib/aiAgent'
import { uploadAndTrainDocument, getDocuments, deleteDocuments } from '@/lib/ragKnowledgeBase'
import { copyToClipboard } from '@/lib/clipboard'
import parseLLMJson from '@/lib/jsonParser'
import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

import { FiUpload, FiFileText, FiMail, FiSearch, FiFilter, FiSettings, FiAlertTriangle, FiAlertCircle, FiCheckCircle, FiXCircle, FiChevronDown, FiChevronUp, FiChevronRight, FiCopy, FiDownload, FiEdit, FiTrash2, FiRefreshCw, FiShield, FiEye, FiX, FiPlus, FiArrowLeft, FiArrowRight, FiLoader, FiCheck, FiInfo } from 'react-icons/fi'

// ─── Constants ───────────────────────────────────────────────────────────────

const MANAGER_AGENT_ID = '699bfc2cfb62c45cbd3beb2d'
const DOCUMENT_OUTPUT_AGENT_ID = '699bfc2c69f2efc6b10175b1'
const RAG_ID = '699bfbc6e9e49857cb77c1bd'

const AGENTS = [
  { id: MANAGER_AGENT_ID, name: 'NDA Review Coordinator', purpose: 'Orchestrates end-to-end NDA analysis' },
  { id: DOCUMENT_OUTPUT_AGENT_ID, name: 'Document Output Agent', purpose: 'Generates final redlined documents and email' },
  { id: '699bfbf34781b21fa64586d4', name: 'Change Extraction Agent', purpose: 'Parses tracked changes from documents' },
  { id: '699bfc08ab50d38abec37be1', name: 'Policy Compliance Agent', purpose: 'Evaluates changes against FSL NDA policy' },
  { id: '699bfbf4ab50d38abec37bd7', name: 'Response Generation Agent', purpose: 'Generates professional negotiation responses' },
]

const RISK_COLORS: Record<string, string> = {
  Critical: 'bg-red-600 text-white',
  High: 'bg-orange-500 text-white',
  Medium: 'bg-yellow-500 text-black',
  Low: 'bg-blue-500 text-white',
  None: 'bg-green-500 text-white',
}

const RISK_BG: Record<string, string> = {
  Critical: 'border-red-500/40 bg-red-50',
  High: 'border-orange-500/40 bg-orange-50',
  Medium: 'border-yellow-500/40 bg-yellow-50',
  Low: 'border-blue-500/40 bg-blue-50',
  None: 'border-green-500/40 bg-green-50',
}

const RECOMMENDATION_COLORS: Record<string, string> = {
  Accept: 'bg-green-100 text-green-800 border-green-300',
  Reject: 'bg-red-100 text-red-800 border-red-300',
  'Counter-Propose': 'bg-amber-100 text-amber-800 border-amber-300',
  Escalate: 'bg-purple-100 text-purple-800 border-purple-300',
}

const CHANGE_TYPE_COLORS: Record<string, string> = {
  addition: 'bg-green-100 text-green-700',
  deletion: 'bg-red-100 text-red-700',
  modification: 'bg-blue-100 text-blue-700',
}

// ─── TypeScript Interfaces ───────────────────────────────────────────────────

interface RiskBreakdown {
  critical: number
  high: number
  medium: number
  low: number
  none: number
}

interface ClauseAnalysis {
  change_id: string
  clause_reference: string
  change_type: string
  original_text: string
  proposed_text: string
  change_summary: string
  risk_level: string
  recommendation: string
  reasoning: string
  policy_reference: string
  counter_proposal_text: string
  response_text: string
  suggested_redline: string
  is_protective_language_deletion: boolean
  legal_keywords_detected: string[]
}

interface AnalysisData {
  executive_summary: string
  total_changes_analyzed: number
  risk_breakdown: RiskBreakdown
  requires_senior_review: boolean
  clause_analyses: ClauseAnalysis[]
  overall_email_draft: string
  negotiation_summary: string
}

interface OverrideEntry {
  recommendation: string
  counterProposal: string
  notes: string
}

interface RedlineInstruction {
  change_id: string
  clause_reference: string
  action: string
  original_text: string
  final_text: string
  instruction: string
}

interface AuditTrailEntry {
  change_id: string
  system_recommendation: string
  final_decision: string
  was_overridden: boolean
  override_notes: string
}

interface OutputData {
  final_email: string
  redline_instructions: RedlineInstruction[]
  audit_trail: AuditTrailEntry[]
  decision_summary: string
}

interface RAGDoc {
  id?: string
  fileName: string
  fileType: string
  fileSize?: number
  status?: string
  uploadedAt?: string
}

// ─── Sample Data ─────────────────────────────────────────────────────────────

const SAMPLE_ANALYSIS: AnalysisData = {
  executive_summary: "Analysis of 6 proposed changes to the Mutual NDA between FSL Corp and Acme Industries. Two changes pose Critical risk to FSL's intellectual property protections. One High-risk modification attempts to reduce the confidentiality period below FSL's minimum threshold. Three changes are acceptable with minor modifications. Senior legal review is required due to the critical findings involving IP protection clause deletions.",
  total_changes_analyzed: 6,
  risk_breakdown: { critical: 2, high: 1, medium: 1, low: 1, none: 1 },
  requires_senior_review: true,
  clause_analyses: [
    {
      change_id: 'CHG-001',
      clause_reference: 'Section 2.1 - Definition of Confidential Information',
      change_type: 'modification',
      original_text: '"Confidential Information" means any and all information, whether written, oral, electronic, or visual, disclosed by either party, including but not limited to trade secrets, proprietary data, business plans, financial information, customer lists, and technical specifications.',
      proposed_text: '"Confidential Information" means information specifically designated as confidential in writing at the time of disclosure.',
      change_summary: 'Narrows the definition of Confidential Information from broad catch-all to only written-designated information, significantly reducing protection scope.',
      risk_level: 'Critical',
      recommendation: 'Reject',
      reasoning: 'This change would eliminate protection for oral disclosures, visual demonstrations, and any information not explicitly marked. FSL policy requires broad CI definitions covering all forms of disclosure. This modification creates significant gaps that could expose trade secrets and proprietary data.',
      policy_reference: 'FSL NDA Policy Section 3.1: Confidential Information definitions must cover written, oral, electronic, and visual disclosures without requiring specific designation.',
      counter_proposal_text: '',
      response_text: 'We cannot accept the proposed narrowing of the Confidential Information definition. FSL requires comprehensive protection covering all forms of disclosure, consistent with industry best practices for technology companies. We insist on retaining the original broad definition.',
      suggested_redline: 'Retain original Section 2.1 text in full. No changes accepted.',
      is_protective_language_deletion: true,
      legal_keywords_detected: ['trade secrets', 'confidential information', 'proprietary data'],
    },
    {
      change_id: 'CHG-002',
      clause_reference: 'Section 4.3 - Non-Solicitation',
      change_type: 'deletion',
      original_text: 'During the term of this Agreement and for a period of two (2) years thereafter, neither party shall directly or indirectly solicit, recruit, or hire any employee, contractor, or consultant of the other party.',
      proposed_text: '',
      change_summary: 'Complete deletion of the non-solicitation clause.',
      risk_level: 'Critical',
      recommendation: 'Reject',
      reasoning: 'The non-solicitation clause is a core protective provision. Its deletion would allow the counterparty to freely recruit FSL employees who have been exposed to confidential information. This is a standard protective clause in FSL NDAs and its removal is not acceptable.',
      policy_reference: 'FSL NDA Policy Section 5.2: Non-solicitation provisions are mandatory in all NDA agreements with a minimum 18-month post-term period.',
      counter_proposal_text: '',
      response_text: 'The non-solicitation clause is a fundamental component of this agreement and cannot be removed. We are open to discussing adjustments to the duration if needed, but the clause itself must remain.',
      suggested_redline: 'Restore deleted Section 4.3 in full.',
      is_protective_language_deletion: true,
      legal_keywords_detected: ['non-solicitation', 'employee', 'recruit'],
    },
    {
      change_id: 'CHG-003',
      clause_reference: 'Section 6.1 - Term and Duration',
      change_type: 'modification',
      original_text: 'The obligations of confidentiality set forth herein shall survive for a period of five (5) years from the date of disclosure of such Confidential Information.',
      proposed_text: 'The obligations of confidentiality set forth herein shall survive for a period of two (2) years from the date of disclosure of such Confidential Information.',
      change_summary: 'Reduces confidentiality obligation period from 5 years to 2 years.',
      risk_level: 'High',
      recommendation: 'Counter-Propose',
      reasoning: 'FSL policy mandates a minimum 3-year confidentiality period. The proposed 2-year term is below this threshold. While 5 years may be negotiable, 2 years is insufficient to protect long-term trade secrets and business strategies.',
      policy_reference: 'FSL NDA Policy Section 4.1: Minimum confidentiality period is 3 years; 5 years preferred for technology-related disclosures.',
      counter_proposal_text: 'The obligations of confidentiality set forth herein shall survive for a period of three (3) years from the date of disclosure of such Confidential Information.',
      response_text: 'We understand the desire for a shorter confidentiality period. While our standard is 5 years, we can accept a 3-year term as a compromise, which is the minimum period required by our internal policies for technology-related disclosures.',
      suggested_redline: 'Change "two (2) years" to "three (3) years" in Section 6.1.',
      is_protective_language_deletion: false,
      legal_keywords_detected: ['confidentiality', 'term', 'survival period'],
    },
    {
      change_id: 'CHG-004',
      clause_reference: 'Section 3.2 - Permitted Disclosures',
      change_type: 'addition',
      original_text: 'The Receiving Party may disclose Confidential Information to its employees, agents, and contractors who have a need to know and are bound by confidentiality obligations no less restrictive than those herein.',
      proposed_text: 'The Receiving Party may disclose Confidential Information to its employees, agents, contractors, affiliates, subsidiaries, and third-party service providers who have a need to know.',
      change_summary: 'Expands permitted disclosure recipients to include affiliates, subsidiaries, and third-party service providers, and removes the requirement for equivalent confidentiality obligations.',
      risk_level: 'Medium',
      recommendation: 'Counter-Propose',
      reasoning: 'While expanding to affiliates may be reasonable, removing the requirement for equivalent confidentiality obligations creates risk. Third-party service providers without binding confidentiality terms could expose FSL information.',
      policy_reference: 'FSL NDA Policy Section 3.3: All downstream recipients must be bound by equivalent confidentiality terms.',
      counter_proposal_text: 'The Receiving Party may disclose Confidential Information to its employees, agents, contractors, and affiliates who have a need to know and are bound by confidentiality obligations no less restrictive than those contained herein.',
      response_text: 'We can accept expanding permitted disclosures to include affiliates, but all recipients must remain bound by equivalent confidentiality obligations. We cannot accept the removal of downstream confidentiality requirements or the inclusion of unbound third-party service providers.',
      suggested_redline: 'Accept addition of "affiliates" but retain "bound by confidentiality obligations no less restrictive than those herein" and remove "subsidiaries, and third-party service providers".',
      is_protective_language_deletion: false,
      legal_keywords_detected: ['permitted disclosures', 'affiliates', 'service providers'],
    },
    {
      change_id: 'CHG-005',
      clause_reference: 'Section 7.2 - Governing Law',
      change_type: 'modification',
      original_text: 'This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware.',
      proposed_text: 'This Agreement shall be governed by and construed in accordance with the laws of the State of New York.',
      change_summary: 'Changes governing law from Delaware to New York.',
      risk_level: 'Low',
      recommendation: 'Accept',
      reasoning: 'New York is an acceptable governing law jurisdiction for FSL. Both Delaware and New York provide strong contractual enforcement frameworks. This change does not materially impact FSL\'s legal position.',
      policy_reference: 'FSL NDA Policy Section 8.1: Acceptable governing law jurisdictions include Delaware, New York, and California.',
      counter_proposal_text: '',
      response_text: 'We accept the change of governing law to New York.',
      suggested_redline: 'Accept as proposed.',
      is_protective_language_deletion: false,
      legal_keywords_detected: ['governing law', 'jurisdiction'],
    },
    {
      change_id: 'CHG-006',
      clause_reference: 'Section 8.1 - Notices',
      change_type: 'modification',
      original_text: 'All notices shall be in writing and delivered by certified mail, return receipt requested.',
      proposed_text: 'All notices shall be in writing and delivered by certified mail, return receipt requested, or by email with read receipt confirmation.',
      change_summary: 'Adds email with read receipt as an acceptable notice delivery method.',
      risk_level: 'None',
      recommendation: 'Accept',
      reasoning: 'Adding email as a notice method is a practical modernization that does not reduce legal protections. Read receipt confirmation provides adequate proof of delivery.',
      policy_reference: 'FSL NDA Policy Section 9.1: Electronic notice methods are acceptable when delivery confirmation is available.',
      counter_proposal_text: '',
      response_text: 'We accept the addition of email with read receipt confirmation as an acceptable notice delivery method.',
      suggested_redline: 'Accept as proposed.',
      is_protective_language_deletion: false,
      legal_keywords_detected: ['notices', 'email'],
    },
  ],
  overall_email_draft: "Dear Counsel,\n\nThank you for sharing Acme Industries' proposed revisions to the Mutual Non-Disclosure Agreement. We have completed our review and provide the following responses:\n\n1. Section 2.1 (Definition of CI): We cannot accept the narrowing of the Confidential Information definition. Our original broad definition must be retained.\n\n2. Section 4.3 (Non-Solicitation): The deletion of the non-solicitation clause is not acceptable. This provision must remain in the agreement.\n\n3. Section 6.1 (Term): We propose a compromise of 3 years instead of the requested 2 years.\n\n4. Section 3.2 (Permitted Disclosures): We can accept adding affiliates but require all recipients to remain bound by equivalent confidentiality obligations.\n\n5. Section 7.2 (Governing Law): We accept the change to New York.\n\n6. Section 8.1 (Notices): We accept the addition of email with read receipts.\n\nPlease find our detailed redline markup attached. We look forward to your response.\n\nBest regards,\nFSL Legal Team",
  negotiation_summary: "Of 6 proposed changes: 2 rejected (Critical risk - CI definition narrowing and non-solicitation deletion), 2 counter-proposed (confidentiality term and permitted disclosures), 2 accepted (governing law and notice methods). Senior review recommended due to attempted removal of core protective provisions.",
}

const SAMPLE_OUTPUT: OutputData = {
  final_email: "Dear Counsel,\n\nThank you for sharing Acme Industries' proposed revisions to the Mutual Non-Disclosure Agreement. After careful review by our legal team, we provide the following responses to each proposed change:\n\n1. Section 2.1 - Definition of Confidential Information: REJECTED. We cannot accept the proposed narrowing. The original broad definition must be retained to ensure comprehensive protection.\n\n2. Section 4.3 - Non-Solicitation: REJECTED. This clause is a fundamental component and cannot be deleted.\n\n3. Section 6.1 - Term and Duration: COUNTER-PROPOSAL. We propose a 3-year confidentiality period as a compromise.\n\n4. Section 3.2 - Permitted Disclosures: COUNTER-PROPOSAL. We accept adding affiliates but require equivalent confidentiality obligations for all recipients.\n\n5. Section 7.2 - Governing Law: ACCEPTED. Change to New York is agreeable.\n\n6. Section 8.1 - Notices: ACCEPTED. Email with read receipts is an acceptable notice method.\n\nPlease find our detailed redline attached.\n\nBest regards,\nFSL Legal Team",
  redline_instructions: [
    { change_id: 'CHG-001', clause_reference: 'Section 2.1', action: 'Reject', original_text: 'Broad CI definition', final_text: 'Retain original text', instruction: 'Remove all proposed changes to Section 2.1. Restore original definition in full.' },
    { change_id: 'CHG-002', clause_reference: 'Section 4.3', action: 'Reject', original_text: 'Non-solicitation clause', final_text: 'Retain original text', instruction: 'Restore deleted Section 4.3 non-solicitation clause in full.' },
    { change_id: 'CHG-003', clause_reference: 'Section 6.1', action: 'Counter-Propose', original_text: 'five (5) years', final_text: 'three (3) years', instruction: 'Replace "two (2) years" with "three (3) years".' },
    { change_id: 'CHG-004', clause_reference: 'Section 3.2', action: 'Counter-Propose', original_text: 'employees, agents, contractors', final_text: 'employees, agents, contractors, affiliates with CI obligations', instruction: 'Accept "affiliates" addition but retain confidentiality obligation requirement and remove "subsidiaries, third-party service providers".' },
    { change_id: 'CHG-005', clause_reference: 'Section 7.2', action: 'Accept', original_text: 'State of Delaware', final_text: 'State of New York', instruction: 'Accept as proposed.' },
    { change_id: 'CHG-006', clause_reference: 'Section 8.1', action: 'Accept', original_text: 'Certified mail only', final_text: 'Certified mail or email with read receipt', instruction: 'Accept as proposed.' },
  ],
  audit_trail: [
    { change_id: 'CHG-001', system_recommendation: 'Reject', final_decision: 'Reject', was_overridden: false, override_notes: '' },
    { change_id: 'CHG-002', system_recommendation: 'Reject', final_decision: 'Reject', was_overridden: false, override_notes: '' },
    { change_id: 'CHG-003', system_recommendation: 'Counter-Propose', final_decision: 'Counter-Propose', was_overridden: false, override_notes: '' },
    { change_id: 'CHG-004', system_recommendation: 'Counter-Propose', final_decision: 'Counter-Propose', was_overridden: false, override_notes: '' },
    { change_id: 'CHG-005', system_recommendation: 'Accept', final_decision: 'Accept', was_overridden: false, override_notes: '' },
    { change_id: 'CHG-006', system_recommendation: 'Accept', final_decision: 'Accept', was_overridden: false, override_notes: '' },
  ],
  decision_summary: 'Of 6 changes reviewed: 2 rejected (Critical risk), 2 counter-proposed (High and Medium risk), 2 accepted (Low and None risk). No user overrides applied. Senior review flagged for the 2 critical findings.',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part)
}

function getRiskColor(risk: string): string {
  return RISK_COLORS[risk] ?? 'bg-gray-200 text-gray-800'
}

function getRiskBg(risk: string): string {
  return RISK_BG[risk] ?? 'border-gray-300 bg-gray-50'
}

function getRecommendationColor(rec: string): string {
  return RECOMMENDATION_COLORS[rec] ?? 'bg-gray-100 text-gray-700 border-gray-300'
}

function getChangeTypeColor(ct: string): string {
  return CHANGE_TYPE_COLORS[ct?.toLowerCase()] ?? 'bg-gray-100 text-gray-700'
}

// ─── Response Extraction Helpers ─────────────────────────────────────────────

/**
 * Safely attempt to parse a value as JSON through multiple strategies.
 * Returns parsed object or null.
 */
function tryParseJson(val: any): any | null {
  if (!val) return null
  // Already an object
  if (typeof val === 'object' && !Array.isArray(val)) return val
  if (typeof val !== 'string') return null

  const trimmed = val.trim()

  // Direct JSON parse
  try { return JSON.parse(trimmed) } catch {}

  // Strip markdown code blocks
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch?.[1]) {
    try { return JSON.parse(codeBlockMatch[1].trim()) } catch {}
  }

  // Find first { ... } or [ ... ] in the string
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) } catch {}
  }

  // Use parseLLMJson as last resort
  try {
    const p = parseLLMJson(val)
    if (p && typeof p === 'object' && !(p.success === false && p.data === null && p.error)) {
      return p
    }
  } catch {}

  return null
}

/**
 * Recursively collect all objects from a nested structure up to a depth limit.
 * This finds the target data no matter how deeply it is nested.
 */
function collectAllObjects(val: any, depth: number = 0, maxDepth: number = 5): any[] {
  if (depth > maxDepth || !val) return []
  const results: any[] = []

  if (typeof val === 'string') {
    const parsed = tryParseJson(val)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      results.push(parsed)
      results.push(...collectAllObjects(parsed, depth + 1, maxDepth))
    }
    return results
  }

  if (Array.isArray(val)) return results

  if (typeof val === 'object') {
    results.push(val)
    for (const key of Object.keys(val)) {
      const child = val[key]
      if (typeof child === 'string') {
        const parsed = tryParseJson(child)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          results.push(parsed)
          results.push(...collectAllObjects(parsed, depth + 1, maxDepth))
        }
      } else if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
        results.push(...collectAllObjects(child, depth + 1, maxDepth))
      }
    }
  }

  return results
}

/**
 * Check if an object looks like AnalysisData (has key marker fields).
 */
function looksLikeAnalysis(obj: any): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  return !!(obj.clause_analyses || obj.executive_summary || obj.risk_breakdown ||
            obj.total_changes_analyzed || obj.negotiation_summary || obj.overall_email_draft)
}

/**
 * Check if an object looks like OutputData (has key marker fields).
 */
function looksLikeOutput(obj: any): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  return !!(obj.final_email || obj.redline_instructions || obj.audit_trail || obj.decision_summary)
}

/**
 * Extract AnalysisData from the agent response by searching the entire response tree.
 */
function extractAnalysisData(rawResult: any, fullResult?: any): AnalysisData | null {
  // Collect all candidate objects from rawResult
  const candidates = collectAllObjects(rawResult)

  // Also search fullResult fields
  if (fullResult) {
    if (fullResult.raw_response) {
      candidates.push(...collectAllObjects(fullResult.raw_response))
    }
    if (fullResult.response) {
      candidates.push(...collectAllObjects(fullResult.response))
    }
    if (fullResult.module_outputs) {
      candidates.push(...collectAllObjects(fullResult.module_outputs))
    }
    // Top-level fullResult itself
    candidates.push(...collectAllObjects(fullResult, 0, 3))
  }

  // Search candidates for the best match
  // Priority: has clause_analyses array > has executive_summary > has risk_breakdown
  let bestMatch: any = null
  let bestScore = 0

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    if (!looksLikeAnalysis(candidate)) continue

    let score = 0
    if (Array.isArray(candidate.clause_analyses) && candidate.clause_analyses.length > 0) score += 10
    if (candidate.clause_analyses) score += 5
    if (candidate.executive_summary) score += 3
    if (candidate.risk_breakdown) score += 2
    if (candidate.total_changes_analyzed) score += 1
    if (candidate.negotiation_summary) score += 1
    if (candidate.overall_email_draft) score += 1

    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate
    }
  }

  if (bestMatch) {
    return normalizeAnalysisData(bestMatch)
  }

  // Last resort: log the full response shape for debugging
  const shapes = candidates.slice(0, 10).map(c => {
    if (!c || typeof c !== 'object') return String(c)?.slice(0, 50)
    const keys = Object.keys(c)
    return `{${keys.slice(0, 8).join(', ')}${keys.length > 8 ? '...' : ''}}`
  })
  console.error('[NDA] extractAnalysisData FAILED. Candidate shapes:', shapes)
  console.error('[NDA] rawResult type:', typeof rawResult, '| keys:', rawResult && typeof rawResult === 'object' ? Object.keys(rawResult) : 'N/A')
  console.error('[NDA] rawResult preview:', JSON.stringify(rawResult)?.slice(0, 500))
  return null
}

function normalizeAnalysisData(obj: any): AnalysisData {
  return {
    executive_summary: obj.executive_summary ?? obj.summary ?? '',
    total_changes_analyzed: typeof obj.total_changes_analyzed === 'number' ? obj.total_changes_analyzed : (Array.isArray(obj.clause_analyses) ? obj.clause_analyses.length : 0),
    risk_breakdown: {
      critical: obj.risk_breakdown?.critical ?? obj.risk_breakdown?.Critical ?? 0,
      high: obj.risk_breakdown?.high ?? obj.risk_breakdown?.High ?? 0,
      medium: obj.risk_breakdown?.medium ?? obj.risk_breakdown?.Medium ?? 0,
      low: obj.risk_breakdown?.low ?? obj.risk_breakdown?.Low ?? 0,
      none: obj.risk_breakdown?.none ?? obj.risk_breakdown?.None ?? 0,
    },
    requires_senior_review: obj.requires_senior_review ?? false,
    clause_analyses: Array.isArray(obj.clause_analyses) ? obj.clause_analyses.map((c: any, idx: number) => ({
      change_id: c.change_id ?? `CHG-${String(idx + 1).padStart(3, '0')}`,
      clause_reference: c.clause_reference ?? c.clause ?? c.section ?? '',
      change_type: c.change_type ?? c.type ?? 'modification',
      original_text: c.original_text ?? c.original ?? '',
      proposed_text: c.proposed_text ?? c.proposed ?? c.new_text ?? '',
      change_summary: c.change_summary ?? c.summary ?? c.description ?? '',
      risk_level: c.risk_level ?? c.risk ?? 'Medium',
      recommendation: c.recommendation ?? c.action ?? 'Escalate',
      reasoning: c.reasoning ?? c.reason ?? c.analysis ?? '',
      policy_reference: c.policy_reference ?? c.policy ?? '',
      counter_proposal_text: c.counter_proposal_text ?? c.counter_proposal ?? '',
      response_text: c.response_text ?? c.response ?? '',
      suggested_redline: c.suggested_redline ?? c.redline ?? '',
      is_protective_language_deletion: c.is_protective_language_deletion ?? false,
      legal_keywords_detected: Array.isArray(c.legal_keywords_detected) ? c.legal_keywords_detected : (Array.isArray(c.keywords) ? c.keywords : []),
    })) : [],
    overall_email_draft: obj.overall_email_draft ?? obj.email_draft ?? '',
    negotiation_summary: obj.negotiation_summary ?? obj.summary ?? '',
  }
}

/**
 * Extract OutputData from the agent response by searching the entire response tree.
 */
function extractOutputData(rawResult: any, fullResult?: any): OutputData | null {
  const candidates = collectAllObjects(rawResult)

  if (fullResult) {
    if (fullResult.raw_response) candidates.push(...collectAllObjects(fullResult.raw_response))
    if (fullResult.response) candidates.push(...collectAllObjects(fullResult.response))
    candidates.push(...collectAllObjects(fullResult, 0, 3))
  }

  let bestMatch: any = null
  let bestScore = 0

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    if (!looksLikeOutput(candidate)) continue

    let score = 0
    if (candidate.final_email) score += 5
    if (Array.isArray(candidate.redline_instructions)) score += 4
    if (Array.isArray(candidate.audit_trail)) score += 3
    if (candidate.decision_summary) score += 2

    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate
    }
  }

  if (bestMatch) {
    return normalizeOutputData(bestMatch)
  }

  const shapes = candidates.slice(0, 10).map(c => {
    if (!c || typeof c !== 'object') return String(c)?.slice(0, 50)
    const keys = Object.keys(c)
    return `{${keys.slice(0, 8).join(', ')}${keys.length > 8 ? '...' : ''}}`
  })
  console.error('[NDA] extractOutputData FAILED. Candidate shapes:', shapes)
  console.error('[NDA] rawResult preview:', JSON.stringify(rawResult)?.slice(0, 500))
  return null
}

function normalizeOutputData(obj: any): OutputData {
  return {
    final_email: obj.final_email ?? obj.email ?? '',
    redline_instructions: Array.isArray(obj.redline_instructions) ? obj.redline_instructions.map((ri: any) => ({
      change_id: ri.change_id ?? '',
      clause_reference: ri.clause_reference ?? ri.clause ?? '',
      action: ri.action ?? '',
      original_text: ri.original_text ?? ri.original ?? '',
      final_text: ri.final_text ?? ri.final ?? '',
      instruction: ri.instruction ?? ri.instructions ?? '',
    })) : [],
    audit_trail: Array.isArray(obj.audit_trail) ? obj.audit_trail.map((at: any) => ({
      change_id: at.change_id ?? '',
      system_recommendation: at.system_recommendation ?? at.recommendation ?? '',
      final_decision: at.final_decision ?? at.decision ?? '',
      was_overridden: at.was_overridden ?? false,
      override_notes: at.override_notes ?? at.notes ?? '',
    })) : [],
    decision_summary: obj.decision_summary ?? obj.summary ?? '',
  }
}

// ─── ErrorBoundary ───────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-slate-500 mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-slate-800 text-white rounded-md text-sm hover:bg-slate-700 transition-colors">Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Sub Components ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3 mb-8">
        <FiLoader className="h-5 w-5 animate-spin text-slate-600" />
        <span className="text-sm text-slate-600 font-medium">Analyzing NDA changes... This may take 1-3 minutes.</span>
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="grid grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}

function RiskPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg p-3 border', getRiskBg(label))}>
      <span className={cn('text-2xl font-bold')}>{count}</span>
      <Badge className={cn('mt-1 text-xs', getRiskColor(label))}>{label}</Badge>
    </div>
  )
}

// ─── Word-Level Diff Engine ──────────────────────────────────────────────────

interface DiffSegment {
  type: 'equal' | 'delete' | 'insert'
  text: string
}

function tokenize(text: string): string[] {
  // Split into words while preserving whitespace and punctuation as separate tokens
  const tokens: string[] = []
  const regex = /(\s+|[^\s]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[0])
  }
  return tokens
}

function computeWordDiff(original: string, proposed: string): DiffSegment[] {
  if (!original && !proposed) return []
  if (!original) return [{ type: 'insert', text: proposed }]
  if (!proposed) return [{ type: 'delete', text: original }]
  if (original === proposed) return [{ type: 'equal', text: original }]

  const oldTokens = tokenize(original)
  const newTokens = tokenize(proposed)

  // LCS-based diff using Myers-like approach with O(NM) DP for correctness
  const n = oldTokens.length
  const m = newTokens.length

  // For very long texts, fall back to sentence-level diff
  if (n * m > 500000) {
    return computeSentenceDiff(original, proposed)
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to produce diff
  const segments: DiffSegment[] = []
  let i = n, j = m

  const rawOps: Array<{ type: 'equal' | 'delete' | 'insert'; token: string }> = []
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      rawOps.unshift({ type: 'equal', token: oldTokens[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawOps.unshift({ type: 'insert', token: newTokens[j - 1] })
      j--
    } else {
      rawOps.unshift({ type: 'delete', token: oldTokens[i - 1] })
      i--
    }
  }

  // Merge consecutive operations of the same type
  for (const op of rawOps) {
    if (segments.length > 0 && segments[segments.length - 1].type === op.type) {
      segments[segments.length - 1].text += op.token
    } else {
      segments.push({ type: op.type, text: op.token })
    }
  }

  return segments
}

function computeSentenceDiff(original: string, proposed: string): DiffSegment[] {
  // Sentence-level fallback for very long texts
  const splitSentences = (t: string) => t.split(/(?<=[.!?;])\s+/).filter(Boolean)
  const oldSents = splitSentences(original)
  const newSents = splitSentences(proposed)

  const oldSet = new Set(oldSents)
  const newSet = new Set(newSents)

  const segments: DiffSegment[] = []

  // Interleave: show removed sentences, then added ones, with matching ones in between
  const allOld = new Set<number>()
  const allNew = new Set<number>()

  // Find matches
  let oi = 0, ni = 0
  while (oi < oldSents.length || ni < newSents.length) {
    if (oi < oldSents.length && ni < newSents.length && oldSents[oi] === newSents[ni]) {
      segments.push({ type: 'equal', text: oldSents[oi] + ' ' })
      oi++; ni++
    } else if (oi < oldSents.length && !newSet.has(oldSents[oi])) {
      segments.push({ type: 'delete', text: oldSents[oi] + ' ' })
      oi++
    } else if (ni < newSents.length && !oldSet.has(newSents[ni])) {
      segments.push({ type: 'insert', text: newSents[ni] + ' ' })
      ni++
    } else {
      // Mismatch - consume both
      if (oi < oldSents.length) {
        segments.push({ type: 'delete', text: oldSents[oi] + ' ' })
        oi++
      }
      if (ni < newSents.length) {
        segments.push({ type: 'insert', text: newSents[ni] + ' ' })
        ni++
      }
    }
  }

  return segments
}

// ─── Redline Components ─────────────────────────────────────────────────────

function RedlineMarkup({ segments }: { segments: DiffSegment[] }) {
  if (segments.length === 0) return <span className="text-slate-400 italic text-sm">(no content)</span>
  return (
    <span className="text-sm leading-relaxed">
      {segments.map((seg, i) => {
        if (seg.type === 'equal') {
          return <span key={i}>{seg.text}</span>
        }
        if (seg.type === 'delete') {
          return (
            <span key={i} className="bg-red-100 text-red-800 line-through decoration-red-500 decoration-2 px-0.5 rounded-sm" title="Deleted from original">
              {seg.text}
            </span>
          )
        }
        // insert
        return (
          <span key={i} className="bg-green-100 text-green-800 underline decoration-green-500 decoration-2 underline-offset-2 px-0.5 rounded-sm" title="Added by counterparty">
            {seg.text}
          </span>
        )
      })}
    </span>
  )
}

function DiffView({ original, proposed, changeType }: { original: string; proposed: string; changeType?: string }) {
  const [viewMode, setViewMode] = useState<'redline' | 'sidebyside'>('redline')

  const segments = useMemo(() => computeWordDiff(original || '', proposed || ''), [original, proposed])

  const stats = useMemo(() => {
    let deletions = 0, insertions = 0
    for (const seg of segments) {
      if (seg.type === 'delete') deletions++
      if (seg.type === 'insert') insertions++
    }
    return { deletions, insertions }
  }, [segments])

  const ct = changeType?.toLowerCase()

  return (
    <div className="space-y-2">
      {/* Header with view toggle and stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Document Comparison</h4>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            {stats.deletions > 0 && (
              <span className="flex items-center gap-0.5 text-red-600">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                {stats.deletions} removed
              </span>
            )}
            {stats.insertions > 0 && (
              <span className="flex items-center gap-0.5 text-green-600 ml-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                {stats.insertions} added
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center bg-slate-100 rounded-md p-0.5">
          <button
            onClick={() => setViewMode('redline')}
            className={cn('px-2 py-1 text-xs rounded transition-colors', viewMode === 'redline' ? 'bg-white text-slate-800 shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700')}
          >
            Redline
          </button>
          <button
            onClick={() => setViewMode('sidebyside')}
            className={cn('px-2 py-1 text-xs rounded transition-colors', viewMode === 'sidebyside' ? 'bg-white text-slate-800 shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700')}
          >
            Side-by-Side
          </button>
        </div>
      </div>

      {viewMode === 'redline' ? (
        /* ── Redline (Tracked Changes) View ── */
        <div className="rounded-md border border-slate-200 bg-white p-4">
          {ct === 'deletion' && !proposed ? (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FiAlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-600 uppercase">Entire Clause Deleted</span>
              </div>
              <span className="text-sm bg-red-100 text-red-800 line-through decoration-red-500 decoration-2 leading-relaxed">{original}</span>
            </div>
          ) : ct === 'addition' && !original ? (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <FiPlus className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs font-semibold text-green-600 uppercase">New Clause Added</span>
              </div>
              <span className="text-sm bg-green-100 text-green-800 underline decoration-green-500 decoration-2 underline-offset-2 leading-relaxed">{proposed}</span>
            </div>
          ) : (
            <RedlineMarkup segments={segments} />
          )}
          {/* Redline legend */}
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center gap-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="bg-red-100 text-red-800 line-through decoration-red-500 px-1 rounded-sm">deleted text</span>
              = removed from original
            </span>
            <span className="flex items-center gap-1">
              <span className="bg-green-100 text-green-800 underline decoration-green-500 underline-offset-2 px-1 rounded-sm">new text</span>
              = added by counterparty
            </span>
          </div>
        </div>
      ) : (
        /* ── Side-by-Side View ── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md border border-red-200 bg-red-50/50 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <FiXCircle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Original (FSL)</span>
            </div>
            <p className="text-sm text-red-900 leading-relaxed">{original || '(empty -- new clause)'}</p>
          </div>
          <div className="rounded-md border border-green-200 bg-green-50/50 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <FiCheckCircle className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Proposed (Counterparty)</span>
            </div>
            <p className="text-sm text-green-900 leading-relaxed">{proposed || '(deleted)'}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function RedlineDocumentPreview({ clauses, overrides }: { clauses: ClauseAnalysis[]; overrides: Record<string, OverrideEntry> }) {
  if (!Array.isArray(clauses) || clauses.length === 0) return null

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FiFileText className="h-4 w-4 text-slate-600" />
            Full Redline Document Preview
          </CardTitle>
          <Badge variant="outline" className="text-xs">{clauses.length} clauses</Badge>
        </div>
        <CardDescription className="text-xs">Unified view of all changes with tracked-changes markup. Red strikethrough = deletions. Green underline = additions/modifications.</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[500px]">
          <div className="space-y-4 pr-4">
            {clauses.map((clause) => {
              const ov = overrides[clause.change_id]
              const effectiveRec = ov?.recommendation || clause.recommendation || ''
              const segments = computeWordDiff(clause.original_text || '', clause.proposed_text || '')
              const ct = clause.change_type?.toLowerCase()

              return (
                <div key={clause.change_id} className="border-l-4 pl-3 py-2" style={{
                  borderLeftColor: effectiveRec === 'Accept' ? '#22c55e' : effectiveRec === 'Reject' ? '#dc2626' : effectiveRec === 'Counter-Propose' ? '#f59e0b' : '#8b5cf6'
                }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold text-slate-700">{clause.clause_reference}</span>
                    <Badge className={cn('text-[10px] h-4', getRiskColor(clause.risk_level))}>{clause.risk_level}</Badge>
                    <Badge variant="outline" className={cn('text-[10px] h-4 border', getRecommendationColor(effectiveRec))}>{effectiveRec}</Badge>
                    {ov?.recommendation && <Badge className="bg-amber-500 text-white text-[10px] h-4">Overridden</Badge>}
                  </div>
                  <div className="text-sm leading-relaxed">
                    {ct === 'deletion' && !clause.proposed_text ? (
                      <span className="bg-red-100 text-red-800 line-through decoration-red-500 decoration-2">{clause.original_text}</span>
                    ) : ct === 'addition' && !clause.original_text ? (
                      <span className="bg-green-100 text-green-800 underline decoration-green-500 decoration-2 underline-offset-2">{clause.proposed_text}</span>
                    ) : (
                      <RedlineMarkup segments={segments} />
                    )}
                  </div>
                  {ov?.counterProposal && (
                    <div className="mt-1.5 text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      <span className="font-semibold text-amber-700">Counter-Proposal: </span>
                      <span className="text-amber-900">{ov.counterProposal}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function RedlineInstructionCard({ instruction }: { instruction: RedlineInstruction }) {
  const segments = useMemo(
    () => computeWordDiff(instruction.original_text || '', instruction.final_text || ''),
    [instruction.original_text, instruction.final_text]
  )
  const action = instruction.action || ''

  return (
    <div className={cn('rounded-lg border p-3', action === 'Reject' ? 'border-red-200 bg-red-50/30' : action === 'Accept' ? 'border-green-200 bg-green-50/30' : action === 'Counter-Propose' ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200')}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-400">{instruction.change_id}</span>
          <span className="text-sm font-semibold text-slate-700">{instruction.clause_reference}</span>
        </div>
        <Badge variant="outline" className={cn('text-xs border', getRecommendationColor(action))}>{action}</Badge>
      </div>
      {/* Inline redline */}
      <div className="text-sm leading-relaxed mb-2">
        <RedlineMarkup segments={segments} />
      </div>
      {/* Instruction */}
      <div className="text-xs text-slate-600 bg-white/60 rounded px-2 py-1.5 border border-slate-100">
        <span className="font-semibold text-slate-500">Instruction: </span>{instruction.instruction}
      </div>
    </div>
  )
}

function AgentStatusPanel({ activeAgentId }: { activeAgentId: string | null }) {
  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <FiShield className="h-4 w-4" />
          Agent Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="space-y-1.5">
          {AGENTS.map(agent => (
            <div key={agent.id} className={cn('flex items-center gap-2 text-xs py-1 px-2 rounded', activeAgentId === agent.id ? 'bg-blue-50 text-blue-800' : 'text-slate-500')}>
              <div className={cn('h-2 w-2 rounded-full shrink-0', activeAgentId === agent.id ? 'bg-blue-500 animate-pulse' : 'bg-slate-300')} />
              <span className="font-medium truncate">{agent.name}</span>
              <span className="hidden lg:inline text-slate-400 truncate ml-auto">{agent.purpose}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function KnowledgeBaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [docs, setDocs] = useState<RAGDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [deleteStatus, setDeleteStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    const res = await getDocuments(RAG_ID)
    if (res.success && Array.isArray(res.documents)) {
      setDocs(res.documents as RAGDoc[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) { fetchDocs() }
  }, [open, fetchDocs])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadStatus('Uploading and training...')
    const res = await uploadAndTrainDocument(RAG_ID, file)
    if (res.success) {
      setUploadStatus('Document uploaded and trained successfully.')
      fetchDocs()
    } else {
      setUploadStatus(`Upload failed: ${res.error ?? 'Unknown error'}`)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (fileName: string) => {
    setDeleteStatus(`Deleting ${fileName}...`)
    const res = await deleteDocuments(RAG_ID, [fileName])
    if (res.success) {
      setDeleteStatus('Document deleted.')
      setDocs(prev => prev.filter(d => d.fileName !== fileName))
    } else {
      setDeleteStatus(`Delete failed: ${res.error ?? 'Unknown error'}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FiFileText className="h-5 w-5" />
            FSL NDA Policy Knowledge Base
          </DialogTitle>
          <DialogDescription>Upload, view, or remove policy documents used by the Policy Compliance Agent.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium">Upload Policy Document (PDF, DOCX, TXT)</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" onChange={handleUpload} className="text-sm" />
            </div>
            {uploadStatus && <p className="text-xs mt-1.5 text-slate-600">{uploadStatus}</p>}
          </div>
          <Separator />
          <div>
            <Label className="text-sm font-medium">Current Documents</Label>
            {loading ? (
              <div className="flex items-center gap-2 mt-2 text-sm text-slate-500"><FiLoader className="h-4 w-4 animate-spin" /> Loading...</div>
            ) : docs.length === 0 ? (
              <p className="text-sm text-slate-400 mt-2">No documents uploaded yet.</p>
            ) : (
              <ScrollArea className="max-h-48 mt-2">
                <div className="space-y-2">
                  {docs.map((doc, idx) => (
                    <div key={doc.id ?? idx} className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-2 text-sm border border-slate-200">
                      <div className="flex items-center gap-2 truncate">
                        <FiFileText className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="truncate">{doc.fileName}</span>
                        {doc.status && <Badge variant="outline" className="text-xs">{doc.status}</Badge>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(doc.fileName)} className="text-red-500 hover:text-red-700 shrink-0">
                        <FiTrash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            {deleteStatus && <p className="text-xs mt-1.5 text-slate-600">{deleteStatus}</p>}
          </div>
        </div>
        <DialogClose asChild>
          <Button variant="outline" className="mt-2 w-full">Close</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function Page() {
  // Screen state
  const [screen, setScreen] = useState<'upload' | 'review' | 'output'>('upload')
  const [sampleMode, setSampleMode] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Upload state - FSL Original (Step 1)
  const [originalInputMode, setOriginalInputMode] = useState<'document' | 'text'>('document')
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [originalText, setOriginalText] = useState('')
  const [originalDragOver, setOriginalDragOver] = useState(false)
  const originalFileRef = useRef<HTMLInputElement>(null)

  // Upload state - Counterparty Redline (Step 2)
  const [inputMode, setInputMode] = useState<'document' | 'email'>('document')
  const [emailText, setEmailText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Loading / error
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  // Data
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [outputData, setOutputData] = useState<OutputData | null>(null)
  const [overrides, setOverrides] = useState<Record<string, OverrideEntry>>({})

  // Filters
  const [riskFilter, setRiskFilter] = useState<string>('all')
  const [recFilter, setRecFilter] = useState<string>('all')
  const [changeTypeFilter, setChangeTypeFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('risk')
  const [searchQuery, setSearchQuery] = useState('')

  // Clipboard feedback
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Email preview open state
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false)

  // Progress simulation for long analysis
  useEffect(() => {
    if (!analyzing) { setProgress(0); return }
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 90) return p
        return p + Math.random() * 5
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [analyzing])

  // Sample data logic
  const currentAnalysis = sampleMode ? SAMPLE_ANALYSIS : analysisData
  const currentOutput = sampleMode ? SAMPLE_OUTPUT : outputData

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleCopy = useCallback(async (text: string, field: string) => {
    await copyToClipboard(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }, [])

  const validateFileExt = useCallback((file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    return ext === 'docx' || ext === 'doc' || ext === 'pdf' || ext === 'txt'
  }, [])

  const handleOriginalFileSelect = useCallback((file: File) => {
    if (validateFileExt(file)) {
      setOriginalFile(file)
    } else {
      setAnalysisError('Please upload a .docx, .pdf, or .txt file for the original NDA.')
    }
  }, [validateFileExt])

  const handleOriginalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setOriginalDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) handleOriginalFileSelect(file)
  }, [handleOriginalFileSelect])

  const handleFileSelect = useCallback((file: File) => {
    if (validateFileExt(file)) {
      setSelectedFile(file)
    } else {
      setAnalysisError('Please upload a .docx, .pdf, or .txt file.')
    }
  }, [validateFileExt])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const handleAnalyze = useCallback(async () => {
    setAnalysisError('')
    setAnalyzing(true)
    setActiveAgentId(MANAGER_AGENT_ID)
    setAnalysisData(null)
    setOverrides({})

    try {
      // ── Step A: Validate that we have the FSL original ──
      const hasOriginalDoc = originalInputMode === 'document' && originalFile
      const hasOriginalText = originalInputMode === 'text' && originalText.trim()
      if (!hasOriginalDoc && !hasOriginalText) {
        setAnalysisError('Please provide the FSL original NDA (upload a document or paste the text).')
        setAnalyzing(false)
        setActiveAgentId(null)
        return
      }

      // ── Step B: Validate counterparty redline input ──
      const hasRedlineDoc = inputMode === 'document' && selectedFile
      const hasRedlineEmail = inputMode === 'email' && emailText.trim()
      if (!hasRedlineDoc && !hasRedlineEmail) {
        setAnalysisError(inputMode === 'document'
          ? 'Please upload the counterparty\'s redlined document.'
          : 'Please paste the counterparty\'s email text with proposed changes.')
        setAnalyzing(false)
        setActiveAgentId(null)
        return
      }

      // ── Step C: Upload documents and collect asset IDs ──
      const allAssetIds: string[] = []

      // Upload FSL original if it's a file
      if (hasOriginalDoc && originalFile) {
        const origUpload = await uploadFiles(originalFile)
        if (!origUpload.success || !Array.isArray(origUpload.asset_ids) || origUpload.asset_ids.length === 0) {
          setAnalysisError(`FSL original upload failed: ${origUpload.error ?? origUpload.message ?? 'Unknown error'}`)
          setAnalyzing(false)
          setActiveAgentId(null)
          return
        }
        allAssetIds.push(...origUpload.asset_ids)
      }

      // Upload counterparty redline if it's a file
      if (hasRedlineDoc && selectedFile) {
        const redlineUpload = await uploadFiles(selectedFile)
        if (!redlineUpload.success || !Array.isArray(redlineUpload.asset_ids) || redlineUpload.asset_ids.length === 0) {
          setAnalysisError(`Counterparty redline upload failed: ${redlineUpload.error ?? redlineUpload.message ?? 'Unknown error'}`)
          setAnalyzing(false)
          setActiveAgentId(null)
          return
        }
        allAssetIds.push(...redlineUpload.asset_ids)
      }

      // ── Step D: Build comparative analysis message ──
      let message = ''

      // Case 1: Both documents uploaded as files
      if (hasOriginalDoc && hasRedlineDoc) {
        message = `I have uploaded two NDA documents for comparative analysis.\n\nThe FIRST document is FSL's original NDA template. The SECOND document is the counterparty's redlined version with proposed changes.\n\nPlease compare these two documents clause-by-clause. For each change the counterparty has made (additions, deletions, modifications), extract the original FSL text and the proposed counterparty text, assess policy compliance, assign risk levels, and generate negotiation responses.`
      }
      // Case 2: Original as text, redline as file
      else if (hasOriginalText && hasRedlineDoc) {
        message = `I am providing FSL's original NDA text below, and I have uploaded the counterparty's redlined version as a document.\n\n--- FSL ORIGINAL NDA TEXT ---\n${originalText}\n--- END FSL ORIGINAL ---\n\nPlease compare the uploaded counterparty redlined document against the FSL original text above. For each change the counterparty has made, extract the original FSL text and the proposed counterparty text, assess policy compliance, assign risk levels, and generate negotiation responses.`
      }
      // Case 3: Original as file, counterparty changes as email
      else if (hasOriginalDoc && hasRedlineEmail) {
        message = `I have uploaded FSL's original NDA document. Below is the counterparty's email describing their proposed changes to the NDA.\n\n--- COUNTERPARTY EMAIL ---\n${emailText}\n--- END COUNTERPARTY EMAIL ---\n\nPlease compare each proposed change from the email against the relevant clauses in the uploaded FSL original NDA. For each change, extract the original FSL text and the proposed modification, assess policy compliance, assign risk levels, and generate negotiation responses.`
      }
      // Case 4: Both as text
      else if (hasOriginalText && hasRedlineEmail) {
        message = `I am providing both FSL's original NDA text and the counterparty's proposed changes as text.\n\n--- FSL ORIGINAL NDA TEXT ---\n${originalText}\n--- END FSL ORIGINAL ---\n\n--- COUNTERPARTY PROPOSED CHANGES ---\n${emailText}\n--- END COUNTERPARTY CHANGES ---\n\nPlease compare the counterparty's proposed changes against FSL's original NDA text clause-by-clause. For each change, extract the original FSL text and the proposed counterparty text, assess policy compliance, assign risk levels, and generate negotiation responses.`
      }

      const result = await callAIAgent(
        message,
        MANAGER_AGENT_ID,
        allAssetIds.length > 0 ? { assets: allAssetIds } : undefined
      )

      if (result.success) {
        const rawResult = result.response?.result
        const data = extractAnalysisData(rawResult, result)
        if (data) {
          setAnalysisData(data)
          setProgress(100)
          setScreen('review')
        } else {
          // Show a diagnostic message with the actual response shape
          const resultKeys = rawResult && typeof rawResult === 'object' ? Object.keys(rawResult) : []
          const resultType = typeof rawResult
          const preview = typeof rawResult === 'string' ? rawResult.slice(0, 200) : JSON.stringify(rawResult)?.slice(0, 200)
          console.error('[NDA] Could not extract analysis data. rawResult type:', resultType, 'keys:', resultKeys, 'preview:', preview)
          console.error('[NDA] Full result:', JSON.stringify(result).slice(0, 3000))
          setAnalysisError(`Could not map agent response to expected format. Response type: ${resultType}, keys: [${resultKeys.join(', ')}]. Preview: ${preview}...`)
        }
      } else {
        const errMsg = result.error ?? result.response?.message ?? 'Analysis failed.'
        console.error('[NDA] Agent call not successful:', errMsg)
        setAnalysisError(errMsg)
      }
    } catch (err: any) {
      console.error('[NDA] Analysis exception:', err)
      setAnalysisError(err?.message ?? 'An unexpected error occurred.')
    } finally {
      setAnalyzing(false)
      setActiveAgentId(null)
    }
  }, [inputMode, selectedFile, emailText, originalInputMode, originalFile, originalText])

  const handleGenerateOutputs = useCallback(async () => {
    if (!currentAnalysis) return
    setGenerateError('')
    setGenerating(true)
    setActiveAgentId(DOCUMENT_OUTPUT_AGENT_ID)

    try {
      const clauses = Array.isArray(currentAnalysis.clause_analyses) ? currentAnalysis.clause_analyses : []
      const finalClauses = clauses.map(clause => {
        const ov = overrides[clause.change_id]
        return {
          change_id: clause.change_id ?? '',
          clause_reference: clause.clause_reference ?? '',
          change_type: clause.change_type ?? '',
          original_text: clause.original_text ?? '',
          proposed_text: clause.proposed_text ?? '',
          change_summary: clause.change_summary ?? '',
          risk_level: clause.risk_level ?? '',
          recommendation: ov?.recommendation ?? clause.recommendation ?? '',
          reasoning: clause.reasoning ?? '',
          policy_reference: clause.policy_reference ?? '',
          counter_proposal_text: ov?.counterProposal || clause.counter_proposal_text || '',
          response_text: clause.response_text ?? '',
          suggested_redline: clause.suggested_redline ?? '',
          override_notes: ov?.notes ?? '',
          was_overridden: !!ov,
        }
      })

      const message = `Generate the final output documents (email response, redline instructions, and audit trail) based on the following reviewed NDA clause analyses with any user overrides applied:\n\n${JSON.stringify({
        executive_summary: currentAnalysis.executive_summary,
        total_changes_analyzed: currentAnalysis.total_changes_analyzed,
        clause_analyses: finalClauses,
        negotiation_summary: currentAnalysis.negotiation_summary,
      }, null, 2)}`

      const result = await callAIAgent(message, DOCUMENT_OUTPUT_AGENT_ID)

      if (result.success) {
        const rawResult = result.response?.result
        const data = extractOutputData(rawResult, result)
        if (data) {
          setOutputData(data)
          setScreen('output')
        } else {
          const resultKeys = rawResult && typeof rawResult === 'object' ? Object.keys(rawResult) : []
          const preview = typeof rawResult === 'string' ? rawResult.slice(0, 200) : JSON.stringify(rawResult)?.slice(0, 200)
          console.error('[NDA] Could not extract output data. Preview:', preview)
          setGenerateError(`Could not map output response. Keys: [${resultKeys.join(', ')}]. Preview: ${preview}...`)
        }
      } else {
        const errMsg = result.error ?? result.response?.message ?? 'Output generation failed.'
        console.error('[NDA] Output agent call not successful:', errMsg)
        setGenerateError(errMsg)
      }
    } catch (err: any) {
      setGenerateError(err?.message ?? 'An unexpected error occurred.')
    } finally {
      setGenerating(false)
      setActiveAgentId(null)
    }
  }, [currentAnalysis, overrides])

  const handleReset = useCallback(() => {
    setScreen('upload')
    setAnalysisData(null)
    setOutputData(null)
    setOverrides({})
    setOriginalFile(null)
    setOriginalText('')
    setOriginalInputMode('document')
    setSelectedFile(null)
    setEmailText('')
    setAnalysisError('')
    setGenerateError('')
    setRiskFilter('all')
    setRecFilter('all')
    setChangeTypeFilter('all')
    setSortBy('risk')
    setSearchQuery('')
    setEmailPreviewOpen(false)
  }, [])

  const handleOverrideChange = useCallback((changeId: string, field: keyof OverrideEntry, value: string) => {
    setOverrides(prev => ({
      ...prev,
      [changeId]: {
        recommendation: prev[changeId]?.recommendation ?? '',
        counterProposal: prev[changeId]?.counterProposal ?? '',
        notes: prev[changeId]?.notes ?? '',
        [field]: value,
      },
    }))
  }, [])

  const clearOverride = useCallback((changeId: string) => {
    setOverrides(prev => {
      const next = { ...prev }
      delete next[changeId]
      return next
    })
  }, [])

  // ─── Filtered & sorted clauses ─────────────────────────────────────────

  const riskOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3, None: 4 }

  const filteredClauses = useMemo(() => {
    const clauses = Array.isArray(currentAnalysis?.clause_analyses) ? currentAnalysis.clause_analyses : []
    let filtered = clauses.filter(c => {
      if (riskFilter !== 'all' && c.risk_level !== riskFilter) return false
      const effectiveRec = overrides[c.change_id]?.recommendation || c.recommendation
      if (recFilter !== 'all' && effectiveRec !== recFilter) return false
      if (changeTypeFilter !== 'all' && c.change_type?.toLowerCase() !== changeTypeFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const searchable = `${c.clause_reference} ${c.change_summary} ${c.original_text} ${c.proposed_text}`.toLowerCase()
        if (!searchable.includes(q)) return false
      }
      return true
    })
    if (sortBy === 'risk') {
      filtered.sort((a, b) => (riskOrder[a.risk_level] ?? 5) - (riskOrder[b.risk_level] ?? 5))
    } else {
      filtered.sort((a, b) => (a.clause_reference ?? '').localeCompare(b.clause_reference ?? ''))
    }
    return filtered
  }, [currentAnalysis, riskFilter, recFilter, changeTypeFilter, sortBy, searchQuery, overrides])

  const overriddenCount = Object.keys(overrides).filter(k => overrides[k]?.recommendation).length

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <TooltipProvider>
        <div className="min-h-screen bg-slate-50 text-slate-900">
          {/* ─── HEADER ─────────────────────────────────────────────── */}
          <header className="sticky top-0 z-50 bg-slate-900 text-white border-b border-slate-700 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-blue-600 text-white font-bold text-sm">FSL</div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight">NDA Negotiation Automation</h1>
                  <p className="text-xs text-slate-400 hidden sm:block">Automated change review, compliance analysis, and response generation</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="sample-toggle" className="text-xs text-slate-400">Sample Data</Label>
                  <Switch id="sample-toggle" checked={sampleMode} onCheckedChange={setSampleMode} />
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} className="text-slate-300 hover:text-white hover:bg-slate-800">
                      <FiSettings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Knowledge Base Settings</TooltipContent>
                </Tooltip>
              </div>
            </div>
            {/* Step indicator */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-2">
              <div className="flex items-center gap-1 text-xs">
                {[
                  { key: 'upload', label: 'Compare Documents' },
                  { key: 'review', label: 'Review & Override' },
                  { key: 'output', label: 'Generate Outputs' },
                ].map((step, idx) => (
                  <React.Fragment key={step.key}>
                    <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors', screen === step.key ? 'bg-blue-600 text-white' : 'text-slate-400')}>
                      <span className={cn('flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold', screen === step.key ? 'bg-white text-blue-600' : 'bg-slate-600 text-slate-300')}>{idx + 1}</span>
                      <span className="hidden sm:inline">{step.label}</span>
                    </div>
                    {idx < 2 && <FiChevronRight className="h-3 w-3 text-slate-600" />}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {/* ─── SCREEN 1: UPLOAD ──────────────────────────────────── */}
            {screen === 'upload' && (
              <div className="space-y-6">
                <div className="text-center max-w-3xl mx-auto">
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Compare & Analyze NDA Changes</h2>
                  <p className="text-sm text-slate-500">Provide FSL's original NDA and the counterparty's redlined version or email with proposed changes. The system will compare them clause-by-clause, evaluate compliance with FSL policy, and generate negotiation responses.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
                  {/* ── LEFT PANEL: FSL Original NDA ── */}
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-blue-600 text-white text-xs font-bold">1</div>
                        <div>
                          <CardTitle className="text-base">FSL Original NDA</CardTitle>
                          <CardDescription className="text-xs">Your standard NDA template as the baseline</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Tabs value={originalInputMode} onValueChange={(v) => setOriginalInputMode(v as 'document' | 'text')}>
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                          <TabsTrigger value="document" className="flex items-center gap-2 text-xs">
                            <FiUpload className="h-3.5 w-3.5" />
                            Upload Document
                          </TabsTrigger>
                          <TabsTrigger value="text" className="flex items-center gap-2 text-xs">
                            <FiFileText className="h-3.5 w-3.5" />
                            Paste Text
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="document">
                          <div
                            className={cn('border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer', originalDragOver ? 'border-blue-400 bg-blue-50' : originalFile ? 'border-green-400 bg-green-50' : 'border-slate-300 hover:border-slate-400')}
                            onDragOver={(e) => { e.preventDefault(); setOriginalDragOver(true) }}
                            onDragLeave={() => setOriginalDragOver(false)}
                            onDrop={handleOriginalDrop}
                            onClick={() => originalFileRef.current?.click()}
                          >
                            <input ref={originalFileRef} type="file" className="hidden" accept=".docx,.doc,.pdf,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOriginalFileSelect(f) }} />
                            {originalFile ? (
                              <div className="space-y-2">
                                <FiCheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                                <p className="text-sm font-medium text-green-700">{originalFile.name}</p>
                                <p className="text-xs text-slate-500">{(originalFile.size / 1024).toFixed(1)} KB</p>
                                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setOriginalFile(null); if (originalFileRef.current) originalFileRef.current.value = '' }} className="text-xs text-slate-500">
                                  <FiX className="h-3 w-3 mr-1" /> Remove
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <FiUpload className="h-8 w-8 text-slate-400 mx-auto" />
                                <p className="text-sm text-slate-600">Drop FSL original NDA here</p>
                                <p className="text-xs text-slate-400">.docx, .pdf, .txt</p>
                              </div>
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="text">
                          <div className="space-y-2">
                            <Textarea
                              placeholder="Paste FSL's original NDA template text here...&#10;&#10;MUTUAL NON-DISCLOSURE AGREEMENT&#10;&#10;Section 1. Definitions&#10;1.1 'Confidential Information' means..."
                              value={originalText}
                              onChange={(e) => setOriginalText(e.target.value)}
                              rows={8}
                              className="text-xs font-mono"
                            />
                            <p className="text-xs text-slate-400">{originalText.length} characters</p>
                          </div>
                        </TabsContent>
                      </Tabs>

                      {/* Status indicator */}
                      <div className={cn('mt-3 flex items-center gap-2 text-xs rounded-md px-3 py-2', (originalFile || originalText.trim()) ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-slate-50 text-slate-400 border border-slate-200')}>
                        {(originalFile || originalText.trim()) ? (
                          <><FiCheckCircle className="h-3.5 w-3.5 shrink-0" /> Original NDA provided</>
                        ) : (
                          <><FiAlertCircle className="h-3.5 w-3.5 shrink-0" /> Awaiting original NDA</>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* ── RIGHT PANEL: Counterparty Redline ── */}
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center h-7 w-7 rounded-full bg-orange-500 text-white text-xs font-bold">2</div>
                        <div>
                          <CardTitle className="text-base">Counterparty Redline</CardTitle>
                          <CardDescription className="text-xs">The redlined document or email with proposed changes</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'document' | 'email')}>
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                          <TabsTrigger value="document" className="flex items-center gap-2 text-xs">
                            <FiUpload className="h-3.5 w-3.5" />
                            Upload Redline
                          </TabsTrigger>
                          <TabsTrigger value="email" className="flex items-center gap-2 text-xs">
                            <FiMail className="h-3.5 w-3.5" />
                            Paste Email
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="document">
                          <div
                            className={cn('border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer', dragOver ? 'border-orange-400 bg-orange-50' : selectedFile ? 'border-green-400 bg-green-50' : 'border-slate-300 hover:border-slate-400')}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => fileRef.current?.click()}
                          >
                            <input ref={fileRef} type="file" className="hidden" accept=".docx,.doc,.pdf,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
                            {selectedFile ? (
                              <div className="space-y-2">
                                <FiCheckCircle className="h-8 w-8 text-green-500 mx-auto" />
                                <p className="text-sm font-medium text-green-700">{selectedFile.name}</p>
                                <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileRef.current) fileRef.current.value = '' }} className="text-xs text-slate-500">
                                  <FiX className="h-3 w-3 mr-1" /> Remove
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <FiUpload className="h-8 w-8 text-slate-400 mx-auto" />
                                <p className="text-sm text-slate-600">Drop counterparty redline here</p>
                                <p className="text-xs text-slate-400">.docx, .pdf, .txt</p>
                              </div>
                            )}
                          </div>
                        </TabsContent>

                        <TabsContent value="email">
                          <div className="space-y-2">
                            <Textarea
                              placeholder="Paste the counterparty's email with proposed changes...&#10;&#10;Dear FSL Legal Team,&#10;&#10;Please find our proposed revisions to the Mutual NDA:&#10;&#10;1. Section 2.1 - We propose to narrow the definition..."
                              value={emailText}
                              onChange={(e) => setEmailText(e.target.value)}
                              rows={8}
                              className="text-xs font-mono"
                            />
                            <p className="text-xs text-slate-400">{emailText.length} characters</p>
                          </div>
                        </TabsContent>
                      </Tabs>

                      {/* Status indicator */}
                      <div className={cn('mt-3 flex items-center gap-2 text-xs rounded-md px-3 py-2', (selectedFile || emailText.trim()) ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-slate-50 text-slate-400 border border-slate-200')}>
                        {(selectedFile || emailText.trim()) ? (
                          <><FiCheckCircle className="h-3.5 w-3.5 shrink-0" /> Counterparty input provided</>
                        ) : (
                          <><FiAlertCircle className="h-3.5 w-3.5 shrink-0" /> Awaiting counterparty redline</>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* ── Analysis Trigger ── */}
                <Card className="max-w-5xl mx-auto border-slate-200 shadow-sm">
                  <CardContent className="py-4">
                    {analysisError && (
                      <div className="mb-4 flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
                        <FiAlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{analysisError}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 text-sm">
                        <div className={cn('flex items-center gap-1.5', (originalFile || originalText.trim()) ? 'text-green-600' : 'text-slate-400')}>
                          {(originalFile || originalText.trim()) ? <FiCheckCircle className="h-4 w-4" /> : <FiAlertCircle className="h-4 w-4" />}
                          <span className="hidden sm:inline">Original</span>
                        </div>
                        <FiPlus className="h-3 w-3 text-slate-400" />
                        <div className={cn('flex items-center gap-1.5', (selectedFile || emailText.trim()) ? 'text-green-600' : 'text-slate-400')}>
                          {(selectedFile || emailText.trim()) ? <FiCheckCircle className="h-4 w-4" /> : <FiAlertCircle className="h-4 w-4" />}
                          <span className="hidden sm:inline">Redline</span>
                        </div>
                        <FiArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="text-slate-600 font-medium">Comparative Analysis</span>
                      </div>
                      <Button
                        onClick={handleAnalyze}
                        disabled={analyzing || (!(originalFile || originalText.trim()) || !(selectedFile || emailText.trim()))}
                        className="bg-slate-800 hover:bg-slate-700 text-white shrink-0"
                      >
                        {analyzing ? (
                          <><FiLoader className="h-4 w-4 mr-2 animate-spin" /> Analyzing...</>
                        ) : (
                          <><FiSearch className="h-4 w-4 mr-2" /> Analyze NDA</>
                        )}
                      </Button>
                    </div>

                    {analyzing && (
                      <div className="mt-4 space-y-2">
                        <Progress value={progress} className="h-2" />
                        <p className="text-xs text-slate-500 text-center">Comparing documents through Change Extraction, Policy Compliance, and Response Generation agents...</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {analyzing && <LoadingSkeleton />}

                {!analyzing && (
                  <div className="max-w-5xl mx-auto">
                    <AgentStatusPanel activeAgentId={activeAgentId} />
                  </div>
                )}
              </div>
            )}

            {/* ─── SCREEN 2: REVIEW DASHBOARD ──────────────────────── */}
            {screen === 'review' && currentAnalysis && (
              <div className="space-y-6">
                {/* Back button */}
                <Button variant="ghost" size="sm" onClick={handleReset} className="text-slate-500 hover:text-slate-700">
                  <FiArrowLeft className="h-4 w-4 mr-1" /> New Analysis
                </Button>

                {/* Senior Review Warning */}
                {currentAnalysis.requires_senior_review && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-800">
                    <FiAlertTriangle className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold text-sm">Senior Legal Review Required</p>
                      <p className="text-xs mt-0.5">Critical findings detected. This analysis must be reviewed by senior counsel before final decisions are communicated.</p>
                    </div>
                  </div>
                )}

                {/* Executive Summary */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FiFileText className="h-5 w-5 text-slate-600" />
                      Executive Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-slate-700 leading-relaxed">{renderMarkdown(currentAnalysis.executive_summary ?? '')}</div>
                  </CardContent>
                </Card>

                {/* Risk Breakdown */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FiShield className="h-4 w-4 text-slate-600" />
                        Risk Breakdown
                      </CardTitle>
                      <Badge variant="outline" className="text-xs">{currentAnalysis.total_changes_analyzed ?? 0} changes analyzed</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-5 gap-3">
                      <RiskPill label="Critical" count={currentAnalysis.risk_breakdown?.critical ?? 0} color="red" />
                      <RiskPill label="High" count={currentAnalysis.risk_breakdown?.high ?? 0} color="orange" />
                      <RiskPill label="Medium" count={currentAnalysis.risk_breakdown?.medium ?? 0} color="yellow" />
                      <RiskPill label="Low" count={currentAnalysis.risk_breakdown?.low ?? 0} color="blue" />
                      <RiskPill label="None" count={currentAnalysis.risk_breakdown?.none ?? 0} color="green" />
                    </div>
                  </CardContent>
                </Card>

                {/* Filters & Sort */}
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <FiFilter className="h-4 w-4" />
                        <span className="font-medium">Filters:</span>
                      </div>
                      <Select value={riskFilter} onValueChange={setRiskFilter}>
                        <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Risk Level" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Risks</SelectItem>
                          <SelectItem value="Critical">Critical</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="None">None</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={recFilter} onValueChange={setRecFilter}>
                        <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Recommendation" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Recommendations</SelectItem>
                          <SelectItem value="Accept">Accept</SelectItem>
                          <SelectItem value="Reject">Reject</SelectItem>
                          <SelectItem value="Counter-Propose">Counter-Propose</SelectItem>
                          <SelectItem value="Escalate">Escalate</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={changeTypeFilter} onValueChange={setChangeTypeFilter}>
                        <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="Change Type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="addition">Addition</SelectItem>
                          <SelectItem value="deletion">Deletion</SelectItem>
                          <SelectItem value="modification">Modification</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Sort by" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="risk">Sort by Risk</SelectItem>
                          <SelectItem value="clause">Sort by Clause</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex-1 min-w-[180px]">
                        <div className="relative">
                          <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search clauses..." className="pl-8 h-8 text-xs" />
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">{filteredClauses.length} of {Array.isArray(currentAnalysis?.clause_analyses) ? currentAnalysis.clause_analyses.length : 0} shown</Badge>
                      {overriddenCount > 0 && <Badge className="bg-amber-500 text-white text-xs shrink-0">{overriddenCount} overridden</Badge>}
                    </div>
                  </CardContent>
                </Card>

                {/* Clause-by-Clause Analysis */}
                <div className="space-y-0">
                  <Accordion type="multiple" className="space-y-3">
                    {filteredClauses.map((clause) => {
                      const ov = overrides[clause.change_id]
                      const isOverridden = !!ov?.recommendation
                      const effectiveRec = ov?.recommendation || clause.recommendation || ''
                      const keywords = Array.isArray(clause.legal_keywords_detected) ? clause.legal_keywords_detected : []

                      return (
                        <AccordionItem key={clause.change_id} value={clause.change_id} className={cn('border rounded-lg shadow-sm overflow-hidden', isOverridden ? 'border-amber-400 border-2' : 'border-slate-200')}>
                          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-slate-50 [&[data-state=open]]:bg-slate-50">
                            <div className="flex flex-wrap items-center gap-2 text-left w-full pr-2">
                              <span className="font-mono text-xs text-slate-400">{clause.change_id}</span>
                              <span className="font-semibold text-sm text-slate-800 flex-1 min-w-[200px]">{clause.clause_reference ?? 'Unknown Clause'}</span>
                              <Badge className={cn('text-xs', getChangeTypeColor(clause.change_type))}>{clause.change_type ?? 'unknown'}</Badge>
                              <Badge className={cn('text-xs', getRiskColor(clause.risk_level))}>{clause.risk_level ?? 'Unknown'}</Badge>
                              <Badge variant="outline" className={cn('text-xs border', getRecommendationColor(effectiveRec))}>{effectiveRec || 'Pending'}</Badge>
                              {isOverridden && (
                                <Badge className="bg-amber-500 text-white text-xs">Overridden</Badge>
                              )}
                              {clause.is_protective_language_deletion && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Badge variant="destructive" className="text-xs"><FiAlertTriangle className="h-3 w-3 mr-1" />Protective</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>Protective language is being deleted</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-4">
                            <div className="space-y-4">
                              {/* Change Summary */}
                              <div>
                                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Change Summary</h4>
                                <p className="text-sm text-slate-700">{clause.change_summary ?? ''}</p>
                              </div>

                              {/* Redline / Diff View */}
                              <DiffView original={clause.original_text ?? ''} proposed={clause.proposed_text ?? ''} changeType={clause.change_type} />

                              {/* Risk & Reasoning */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Risk Assessment & Reasoning</h4>
                                  <div className="text-sm text-slate-700 leading-relaxed">{renderMarkdown(clause.reasoning ?? '')}</div>
                                </div>
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Policy Reference</h4>
                                  <p className="text-sm text-slate-600 italic">{clause.policy_reference ?? 'No policy reference available.'}</p>
                                </div>
                              </div>

                              {/* Response Text */}
                              {clause.response_text && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">System Response</h4>
                                  <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-md border border-slate-200">{renderMarkdown(clause.response_text)}</div>
                                </div>
                              )}

                              {/* Counter Proposal */}
                              {clause.counter_proposal_text && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Counter-Proposal Text</h4>
                                  <div className="text-sm text-slate-700 bg-amber-50 p-3 rounded-md border border-amber-200">{clause.counter_proposal_text}</div>
                                </div>
                              )}

                              {/* Suggested Redline */}
                              {clause.suggested_redline && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Suggested Redline</h4>
                                  <div className="text-sm text-slate-700 bg-blue-50 p-3 rounded-md border border-blue-200 font-mono">{clause.suggested_redline}</div>
                                </div>
                              )}

                              {/* Legal Keywords */}
                              {keywords.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Legal Keywords Detected</h4>
                                  <div className="flex flex-wrap gap-1.5">
                                    {keywords.map((kw, i) => <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>)}
                                  </div>
                                </div>
                              )}

                              <Separator />

                              {/* Override Controls */}
                              <div className={cn('rounded-lg p-4', isOverridden ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50 border border-slate-200')}>
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                                    <FiEdit className="h-3.5 w-3.5" />
                                    Override Decision
                                  </h4>
                                  {isOverridden && (
                                    <Button variant="ghost" size="sm" onClick={() => clearOverride(clause.change_id)} className="text-xs text-slate-500 h-6">
                                      <FiRefreshCw className="h-3 w-3 mr-1" /> Reset
                                    </Button>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div>
                                    <Label className="text-xs text-slate-500 mb-1 block">Recommendation</Label>
                                    <Select value={ov?.recommendation ?? ''} onValueChange={(v) => handleOverrideChange(clause.change_id, 'recommendation', v)}>
                                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={clause.recommendation || 'Keep system recommendation'} /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="Accept">Accept</SelectItem>
                                        <SelectItem value="Reject">Reject</SelectItem>
                                        <SelectItem value="Counter-Propose">Counter-Propose</SelectItem>
                                        <SelectItem value="Escalate">Escalate</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-slate-500 mb-1 block">Counter-Proposal (if applicable)</Label>
                                    <Textarea
                                      value={ov?.counterProposal ?? ''}
                                      onChange={(e) => handleOverrideChange(clause.change_id, 'counterProposal', e.target.value)}
                                      placeholder="Enter custom counter-proposal text..."
                                      rows={2}
                                      className="text-xs resize-none"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-slate-500 mb-1 block">Override Notes</Label>
                                    <Textarea
                                      value={ov?.notes ?? ''}
                                      onChange={(e) => handleOverrideChange(clause.change_id, 'notes', e.target.value)}
                                      placeholder="Reason for overriding system recommendation..."
                                      rows={2}
                                      className="text-xs resize-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                </div>

                {filteredClauses.length === 0 && (
                  <div className="text-center py-12 text-slate-400">
                    <FiSearch className="h-8 w-8 mx-auto mb-2" />
                    <p className="text-sm">No clauses match the current filters.</p>
                  </div>
                )}

                {/* Overall Email Draft & Negotiation Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Collapsible open={emailPreviewOpen} onOpenChange={setEmailPreviewOpen}>
                    <Card className="border-slate-200 shadow-sm">
                      <CardHeader className="pb-2">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <FiMail className="h-4 w-4 text-slate-500" />
                              Overall Email Draft
                            </CardTitle>
                            {emailPreviewOpen ? <FiChevronUp className="h-4 w-4 text-slate-400" /> : <FiChevronDown className="h-4 w-4 text-slate-400" />}
                          </Button>
                        </CollapsibleTrigger>
                      </CardHeader>
                      <CollapsibleContent>
                        <CardContent>
                          <ScrollArea className="max-h-64">
                            <div className="bg-slate-50 p-3 rounded-md border border-slate-200 text-sm">
                              {renderMarkdown(currentAnalysis.overall_email_draft ?? '')}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>

                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FiInfo className="h-4 w-4 text-slate-500" />
                        Negotiation Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-slate-700 leading-relaxed">{renderMarkdown(currentAnalysis.negotiation_summary ?? '')}</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Full Redline Document Preview */}
                <RedlineDocumentPreview
                  clauses={Array.isArray(currentAnalysis.clause_analyses) ? currentAnalysis.clause_analyses : []}
                  overrides={overrides}
                />

                {/* Generate Outputs */}
                <Card className="border-slate-200 shadow-sm">
                  <CardContent className="py-4">
                    {generateError && (
                      <div className="mb-4 flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
                        <FiAlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{generateError}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">Ready to generate final outputs?</p>
                        <p className="text-xs text-slate-500 mt-0.5">This will produce the final email response, redline instructions, and audit trail.{overriddenCount > 0 ? ` ${overriddenCount} override(s) will be applied.` : ''}</p>
                      </div>
                      <Button onClick={handleGenerateOutputs} disabled={generating} className="bg-blue-600 hover:bg-blue-700 text-white shrink-0 ml-4">
                        {generating ? (
                          <><FiLoader className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                        ) : (
                          <><FiArrowRight className="h-4 w-4 mr-2" /> Generate Outputs</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Agent Status */}
                <AgentStatusPanel activeAgentId={activeAgentId} />
              </div>
            )}

            {/* ─── SCREEN 3: OUTPUT ─────────────────────────────────── */}
            {screen === 'output' && currentOutput && (
              <div className="space-y-6">
                {/* Back button */}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setScreen('review')} className="text-slate-500 hover:text-slate-700">
                    <FiArrowLeft className="h-4 w-4 mr-1" /> Back to Review
                  </Button>
                </div>

                <div className="text-center max-w-2xl mx-auto">
                  <FiCheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
                  <h2 className="text-2xl font-bold text-slate-800">Outputs Generated</h2>
                  <p className="text-sm text-slate-500 mt-1">Final documents are ready for review and distribution.</p>
                </div>

                {/* Decision Summary */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FiInfo className="h-4 w-4 text-slate-600" />
                      Decision Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-slate-700 leading-relaxed">{renderMarkdown(currentOutput.decision_summary ?? '')}</div>
                  </CardContent>
                </Card>

                {/* Final Email */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FiMail className="h-4 w-4 text-slate-600" />
                        Final Email Response
                      </CardTitle>
                      <Button variant="outline" size="sm" onClick={() => handleCopy(currentOutput.final_email ?? '', 'email')} className="text-xs">
                        {copiedField === 'email' ? <><FiCheck className="h-3.5 w-3.5 mr-1 text-green-500" /> Copied</> : <><FiCopy className="h-3.5 w-3.5 mr-1" /> Copy Email</>}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-80">
                      <div className="bg-white border border-slate-200 rounded-md p-4 text-sm leading-relaxed">
                        {renderMarkdown(currentOutput.final_email ?? '')}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Redline Instructions - with inline tracked changes */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FiEdit className="h-4 w-4 text-slate-600" />
                        Redline Document
                      </CardTitle>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <span className="bg-red-100 text-red-800 line-through decoration-red-500 px-1 rounded-sm">deleted</span>
                          = removed
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="bg-green-100 text-green-800 underline decoration-green-500 underline-offset-2 px-1 rounded-sm">added</span>
                          = new/modified
                        </span>
                      </div>
                    </div>
                    <CardDescription className="text-xs">Each clause shows the tracked changes between original and final text with the action instruction.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(Array.isArray(currentOutput.redline_instructions) && currentOutput.redline_instructions.length > 0) ? (
                      <div className="space-y-3">
                        {currentOutput.redline_instructions.map((ri, idx) => (
                          <RedlineInstructionCard key={ri.change_id ?? idx} instruction={ri} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-sm text-slate-400 py-6">No redline instructions available.</div>
                    )}
                  </CardContent>
                </Card>

                {/* Audit Trail */}
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FiEye className="h-4 w-4 text-slate-600" />
                      Audit Trail
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Change ID</TableHead>
                            <TableHead className="text-xs">System Recommendation</TableHead>
                            <TableHead className="text-xs">Final Decision</TableHead>
                            <TableHead className="text-xs">Overridden?</TableHead>
                            <TableHead className="text-xs">Override Notes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(Array.isArray(currentOutput.audit_trail) ? currentOutput.audit_trail : []).map((at, idx) => (
                            <TableRow key={at.change_id ?? idx} className={at.was_overridden ? 'bg-amber-50/50' : ''}>
                              <TableCell className="text-xs font-mono">{at.change_id ?? ''}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn('text-xs border', getRecommendationColor(at.system_recommendation ?? ''))}>{at.system_recommendation ?? ''}</Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn('text-xs border', getRecommendationColor(at.final_decision ?? ''))}>{at.final_decision ?? ''}</Badge>
                              </TableCell>
                              <TableCell className="text-xs">
                                {at.was_overridden ? (
                                  <Badge className="bg-amber-500 text-white text-xs">Yes</Badge>
                                ) : (
                                  <span className="text-slate-400">No</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-slate-600">{at.override_notes ?? '-'}</TableCell>
                            </TableRow>
                          ))}
                          {(!Array.isArray(currentOutput.audit_trail) || currentOutput.audit_trail.length === 0) && (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-sm text-slate-400 py-6">No audit trail entries available.</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex items-center justify-center gap-3 pt-4">
                  <Button variant="outline" onClick={() => setScreen('review')} className="flex items-center gap-2">
                    <FiArrowLeft className="h-4 w-4" />
                    Back to Review
                  </Button>
                  <Button onClick={handleReset} className="bg-slate-800 hover:bg-slate-700 text-white flex items-center gap-2">
                    <FiRefreshCw className="h-4 w-4" />
                    Start New Review
                  </Button>
                </div>

                {/* Agent Status */}
                <AgentStatusPanel activeAgentId={activeAgentId} />
              </div>
            )}

            {/* ─── Screen 2/3 fallback if no data ────────────────────── */}
            {screen === 'review' && !currentAnalysis && !analyzing && (
              <div className="text-center py-20 text-slate-400">
                <FiFileText className="h-12 w-12 mx-auto mb-3" />
                <p className="text-base font-medium">No analysis data available.</p>
                <p className="text-sm mt-1">Go back and run an analysis, or enable Sample Data to preview the interface.</p>
                <Button variant="outline" onClick={handleReset} className="mt-4">
                  <FiArrowLeft className="h-4 w-4 mr-2" /> Back to Upload
                </Button>
              </div>
            )}
            {screen === 'output' && !currentOutput && !generating && (
              <div className="text-center py-20 text-slate-400">
                <FiFileText className="h-12 w-12 mx-auto mb-3" />
                <p className="text-base font-medium">No output data available.</p>
                <p className="text-sm mt-1">Go back and generate outputs, or enable Sample Data to preview.</p>
                <Button variant="outline" onClick={() => setScreen('review')} className="mt-4">
                  <FiArrowLeft className="h-4 w-4 mr-2" /> Back to Review
                </Button>
              </div>
            )}
          </main>

          {/* Knowledge Base Dialog */}
          <KnowledgeBaseDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        </div>
      </TooltipProvider>
    </ErrorBoundary>
  )
}
