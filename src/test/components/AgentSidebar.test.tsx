import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { useAgentStore } from '../../stores/agentStore'
import {
  renderSidebar,
  resetStore,
} from '../components/__shared/agentTestData'

// ── Mock Tauri invoke (once per file, minimal factory) ────────────────────

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AgentSidebar', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  // ── Header ──────────────────────────────────────────────────────────────

  describe('header', () => {
    it('renders title and subtitle', () => {
      renderSidebar()
      expect(screen.getByText('MOTHERSHIP')).toBeInTheDocument()
      expect(screen.getByText('Engineering Team')).toBeInTheDocument()
    })
  })

  // ── Category groups ─────────────────────────────────────────────────────

  describe('category groups', () => {
    it('renders all categories with counts', () => {
      renderSidebar()

      // Labels with counts
      expect(screen.getByText('Engineering · 3')).toBeInTheDocument()
      expect(screen.getByText('Operations · 2')).toBeInTheDocument()
      expect(screen.getByText('Quality · 1')).toBeInTheDocument()
      expect(screen.getByText('Data & AI · 2')).toBeInTheDocument()

      // Agents visible
      expect(screen.getByText('Software Engineer')).toBeInTheDocument()
      expect(screen.getByText('DevOps Engineer')).toBeInTheDocument()
      expect(screen.getByText('Security Engineer')).toBeInTheDocument()
      expect(screen.getByText('QA Engineer')).toBeInTheDocument()
    })
  })

  // ── Agent rows — display ──────────────────────────────────────────────

  describe('agent rows display', () => {
    it('renders all agent names and status dots', () => {
      renderSidebar()

      // Names
      const names = ['Software Engineer', 'Software Engineer #2', 'Tech Lead', 'DevOps Engineer', 'Security Engineer', 'QA Engineer', 'Data Engineer', 'ML Engineer']
      names.forEach((n) => expect(screen.getByText(n)).toBeInTheDocument())

      // Status dots — all 8 idle
      expect(screen.getAllByTitle('idle').length).toBe(8)
    })
  })

  // ── Agent rows — selection and activation ───────────────────────────────

  describe('agent selection', () => {
    it('sets activeAgentId when an agent is clicked', () => {
      renderSidebar()
      expect(useAgentStore.getState().activeAgentId).toBeNull()
      fireEvent.click(screen.getByText('Software Engineer'))
      expect(useAgentStore.getState().activeAgentId).toBe('se-1')
    })
  })

  // ── Footer ──────────────────────────────────────────────────────────────

  describe('footer', () => {
    it('shows agent count and Add Team Member button', () => {
      renderSidebar()
      expect(screen.getByText(/8 team members/)).toBeInTheDocument()
      expect(screen.queryByText(/active/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Add Team Member/i })).toBeInTheDocument()
    })

    it('shows running count when agents are running', () => {
      // Set some agents to running before render
      useAgentStore.setState({
        agents: useAgentStore.getState().agents.map((a) =>
          a.id === 'se-1' || a.id === 'se-2' ? { ...a, status: 'running' as const } : a
        ),
      })
      renderSidebar()

      expect(screen.getByText(/2 active/)).toBeInTheDocument()
      expect(screen.getByText(/8 team members/)).toBeInTheDocument()
    })
  })

  // ── Add Agent dialog ──────────────────────────────────────────────────

  describe('add agent dialog', () => {
    it('opens and closes via Cancel button', () => {
      renderSidebar()
      expect(screen.queryByText(/Role/)).not.toBeInTheDocument()

      // Open dialog
      fireEvent.click(screen.getByRole('button', { name: /Add Team Member/i }))
      expect(screen.getByText(/Select a role/)).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()

      // Close via Cancel
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByText(/Select a role/)).not.toBeInTheDocument()
    })

    it('closes when backdrop is clicked', () => {
      renderSidebar()

      fireEvent.click(screen.getByRole('button', { name: /Add Team Member/i }))
      expect(screen.getByText(/Select a role/)).toBeInTheDocument()

      const backdrop = document.querySelector('.fixed.inset-0.z-50 > .absolute')
      expect(backdrop).not.toBeNull()
      fireEvent.click(backdrop!)

      expect(screen.queryByText(/Select a role/)).not.toBeInTheDocument()
    })
  })
})
