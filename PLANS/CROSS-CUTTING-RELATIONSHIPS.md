# Mothership — Cross-Cutting Concern Relationships

**Last Updated:** 2026-06-15
**Status:** Final Draft
**Scope:** Visual reference for document interconnections

---

## Overview

This document provides visual diagrams showing how the 10 cross-cutting concern documents relate to each other. Use this as a quick reference when navigating between concerns.

---

## 1. Relationship Matrix

| | ERROR | SECURITY | TESTING | MONITORING | CONFIG | MIGRATIONS | OFFLINE | ACCESS | BACKUP | PHASES |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **ERROR** | — | ✓ | ✓ | ✓ | | | ✓ | | ✓ | |
| **SECURITY** | ✓ | — | ✓ | ✓ | ✓ | ✓ | | | | |
| **TESTING** | ✓ | ✓ | — | | ✓ | | | ✓ | | ✓ |
| **MONITORING** | ✓ | ✓ | | — | ✓ | ✓ | ✓ | ✓ | | |
| **CONFIG** | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | | ✓ |
| **MIGRATIONS** | ✓ | ✓ | | ✓ | ✓ | — | | | ✓ | ✓ |
| **OFFLINE** | ✓ | | | ✓ | ✓ | | — | | ✓ | |
| **ACCESS** | ✓ | | ✓ | ✓ | ✓ | | | — | | |
| **BACKUP** | ✓ | ✓ | | | | ✓ | ✓ | | — | |
| **PHASES** | | | ✓ | ✓ | ✓ | ✓ | | | | — |

**Legend:** ✓ = Bidirectional cross-reference exists

---

## 2. Network Diagram (ASCII)

```
                           ┌─────────────────┐
                           │   ERROR-HANDLING │
                           │    (Hub Node)    │
                           └────────┬────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
            ▼                       ▼                       ▼
    ┌───────────────┐      ┌───────────────┐      ┌───────────────┐
    │   MONITORING   │◄────►│   SECURITY    │◄────►│ CONFIGURATION │
    └───────┬───────┘      └───────┬───────┘      └───────┬───────┘
            │                       │                       │
            │       ┌───────────────┼───────────────┐       │
            │       │               │               │       │
            ▼       ▼               ▼               ▼       ▼
    ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
    │  OFFLINE  │ │  TESTING  │ │  ACCESS   │ │ MIGRATIONS│ │   PHASES  │
    │  BEHAVIOR │◄┤  STRATEGY │◄┤           │ │           │◄┤TRANSITIONS│
    └─────┬─────┘ └─────┬─────┘ └───────────┘ └─────┬─────┘ └───────────┘
          │             │                             │
          └─────────────┼─────────────────────────────┘
                        │
                        ▼
                ┌───────────────┐
                │   BACKUP &    │
                │    EXPORT     │
                └───────────────┘
```

---

## 3. Cluster Diagram

### Core Cluster (Always Relevant)

```
    ┌─────────────────────────────────────────────────────────┐
    │                    CORE CLUSTER                         │
    │                                                         │
    │   ┌─────────────┐     ┌─────────────┐                  │
    │   │    ERROR    │────►│  MONITORING  │                  │
    │   │   HANDLING  │◄────│              │                  │
    │   └──────┬──────┘     └──────┬──────┘                  │
    │          │                    │                          │
    │          ▼                    ▼                          │
    │   ┌─────────────┐     ┌─────────────┐                  │
    │   │   SECURITY  │◄───►│CONFIGURATION│                  │
    │   └─────────────┘     └─────────────┘                  │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
```

### Data Cluster (Storage & Persistence)

```
    ┌─────────────────────────────────────────────────────────┐
    │                    DATA CLUSTER                         │
    │                                                         │
    │   ┌─────────────┐     ┌─────────────┐                  │
    │   │   SCHEMA    │────►│   BACKUP    │                  │
    │   │ MIGRATIONS  │◄────│   & EXPORT  │                  │
    │   └──────┬──────┘     └──────┬──────┘                  │
    │          │                    │                          │
    │          ▼                    ▼                          │
    │   ┌─────────────┐     ┌─────────────┐                  │
    │   │   OFFLINE   │◄───►│   CONFIG    │                  │
    │   │   BEHAVIOR  │     │             │                  │
    │   └─────────────┘     └─────────────┘                  │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
```

### Quality Cluster (Testing & UX)

```
    ┌─────────────────────────────────────────────────────────┐
    │                   QUALITY CLUSTER                       │
    │                                                         │
    │   ┌─────────────┐     ┌─────────────┐                  │
    │   │   TESTING   │────►│ACCESSIBILITY│                  │
    │   │  STRATEGY   │◄────│             │                  │
    │   └──────┬──────┘     └─────────────┘                  │
    │          │                                              │
    │          ▼                                              │
    │   ┌─────────────┐                                      │
    │   │   PHASE     │                                      │
    │   │ TRANSITIONS │                                      │
    │   └─────────────┘                                      │
    │                                                         │
    └─────────────────────────────────────────────────────────┘
```

---

## 4. Connection Types

### Direct Connections (Strong Relationships)

| From → To | Relationship Type | Description |
|---|---|---|
| ERROR ↔ MONITORING | **Feedback Loop** | Errors trigger alerts; monitoring detects errors |
| ERROR ↔ SECURITY | **Security Events** | Security failures are errors; errors may indicate breaches |
| ERROR ↔ OFFLINE | **Failure Detection** | Network failures trigger offline mode |
| ERROR ↔ BACKUP | **Recovery** | Crash recovery uses backups |
| SECURITY ↔ CONFIG | **Permissions** | Config defines agent permissions |
| SECURITY ↔ MIGRATIONS | **Encryption** | Migrations handle DB encryption |
| MONITORING ↔ CONFIG | **Settings** | Debug mode, log levels in config |
| MONITORING ↔ OFFLINE | **Connectivity** | Network status monitoring |
| CONFIG ↔ ACCESSIBILITY | **Keyboard** | Shortcut configuration |
| MIGRATIONS ↔ BACKUP | **Data Safety** | Backup before migration |
| TESTING ↔ PHASES | **Gate Validation** | Tests validate phase gates |
| TESTING ↔ ACCESSIBILITY | **WCAG Testing** | Accessibility test scenarios |

### Indirect Connections (Weak Relationships)

| From → To | Via | Description |
|---|---|---|
| ACCESSIBILITY ↔ ERROR | MONITORING | Accessible error messages |
| OFFLINE ↔ CONFIG | ERROR | Fallback settings |
| PHASES ↔ MIGRATIONS | ERROR | Rollback during transitions |
| BACKUP ↔ SECURITY | ERROR | API key redaction in exports |

---

## 5. Dependency Flow

```
Phase 0 (Foundation)
    │
    ├──► ERROR-HANDLING (setup crash handlers)
    ├──► SECURITY (setup SecretStore)
    ├──► TESTING (setup Vitest + cargo test)
    └──► CONFIGURATION (setup UserConfig)

Phase 1a (Core)
    │
    ├──► ERROR-HANDLING (sidecar crash recovery)
    ├──► SECURITY (terminal isolation)
    ├──► TESTING (unit tests for stores)
    └──► CONFIGURATION (agent config)

Phase 1b (Context)
    │
    ├──► ERROR-HANDLING (SQLite corruption)
    ├──► SCHEMA-MIGRATIONS (initial schema)
    ├──► TESTING (memory layer tests)
    └──► CONFIGURATION (project settings)

Phase 2 (Enhanced)
    │
    ├──► MONITORING (health checks)
    ├──► OFFLINE-BEHAVIOR (connectivity)
    ├──► BACKUP-EXPORT (auto-backups)
    └──► ACCESSIBILITY (keyboard nav)

Phase 3 (Advanced)
    │
    ├──► MONITORING (performance metrics)
    ├──► OFFLINE-BEHAVIOR (local inference)
    └──► ACCESSIBILITY (ARIA patterns)

Phase 4 (Distribution)
    │
    ├──► TESTING (E2E tests)
    ├──► ACCESSIBILITY (WCAG compliance)
    └──► PHASE-TRANSITIONS (gate validation)
```

---

## 6. Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    QUICK REFERENCE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  NEED TO HANDLE A CRASH?                                    │
│  → Read ERROR-HANDLING.md                                   │
│  → Also check: MONITORING.md (logging), BACKUP-EXPORT.md   │
│                                                             │
│  NEED TO SECURE SOMETHING?                                  │
│  → Read SECURITY.md                                         │
│  → Also check: CONFIGURATION.md (permissions)               │
│                                                             │
│  NEED TO TEST A FEATURE?                                    │
│  → Read TESTING-STRATEGY.md                                 │
│  → Also check: PHASE-TRANSITIONS.md (gates)                 │
│                                                             │
│  NEED TO MONITOR HEALTH?                                    │
│  → Read MONITORING.md                                       │
│  → Also check: ERROR-HANDLING.md (alerts)                   │
│                                                             │
│  NEED TO CONFIGURE SOMETHING?                               │
│  → Read CONFIGURATION.md                                    │
│  → Also check: SECURITY.md (secrets), ACCESSIBILITY.md      │
│                                                             │
│  NEED TO MIGRATE DATABASE?                                  │
│  → Read SCHEMA-MIGRATIONS.md                                │
│  → Also check: BACKUP-EXPORT.md (backup first!)             │
│                                                             │
│  NEED TO HANDLE OFFLINE?                                    │
│  → Read OFFLINE-BEHAVIOR.md                                 │
│  → Also check: ERROR-HANDLING.md (network failures)         │
│                                                             │
│  NEED TO MAKE IT ACCESSIBLE?                                │
│  → Read ACCESSIBILITY.md                                    │
│  → Also check: TESTING-STRATEGY.md (axe-core tests)         │
│                                                             │
│  NEED TO BACKUP/EXPORT DATA?                                │
│  → Read BACKUP-EXPORT.md                                    │
│  → Also check: SCHEMA-MIGRATIONS.md (pre-migration backup)  │
│                                                             │
│  NEED TO MANAGE PHASES?                                     │
│  → Read PHASE-TRANSITIONS.md                                │
│  → Also check: TESTING-STRATEGY.md (gate validation)        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Document Count Summary

| Category | Documents | Total Connections |
|---|---|---|
| Core Cluster | ERROR, MONITORING, SECURITY, CONFIG | 12 connections |
| Data Cluster | MIGRATIONS, BACKUP, OFFLINE, CONFIG | 8 connections |
| Quality Cluster | TESTING, ACCESSIBILITY, PHASES | 6 connections |
| **Total** | **10 documents** | **34 connections** |

---

*This diagram is auto-generated from the cross-references in each document.*
