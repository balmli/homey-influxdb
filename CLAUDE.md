# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Homey app (smart home platform) that exports metrics to InfluxDB. It monitors device capabilities, Homey system metrics (CPU, memory, storage), and app metrics, then writes them to an InfluxDB database (v1.x or v2.x) for visualization with tools like Grafana.

## Build and Development Commands

```bash
# Run app on connected Homey device
homey app run

# Validate the app manifest
homey app validate

# Install app on local Homey device
homey app install

# Run tests
npm test  # Uses Mocha test runner with Chai assertions
```

## Architecture

### Technology Stack

- **Language**: JavaScript (Node.js)
- **Homey SDK**: SDK 3
- **Key Dependencies**:
  - `homey-api@3.14.23` - Homey API client for accessing devices and system info
  - `http.min@^2.0.1` - Minimal HTTP client for InfluxDB writes
  - `mocha@^10.2.0` & `chai@^4.3.7` - Test framework and assertions

### Core Components

**app.js** - Main application entry point (`InfluxDbApp` extends `Homey.App`)
- Initializes Homey API connection and waits for device initialization
- Coordinates all handlers (DeviceHandler, HomeyStateHandler, InsightsHandler)
- Manages settings initialization and flow card registration
- Schedules periodic writes to InfluxDB
- Handles app unload and cleanup

**lib/InfluxDb.js** - InfluxDB client and connection manager
- Supports both InfluxDB v1.x (username/password) and v2.x (organization/token)
- Buffers measurements in memory (max 2000, writes when queue reaches 1000)
- Configurable write interval (10-60 seconds, default 10)
- Auto-detects v2 when organization and token are present
- Emits 'online'/'offline' events for connection status
- Uses `http.min` for HTTP requests to InfluxDB

**lib/DeviceHandler.js** - Monitors Homey devices and capabilities
- Extends EventEmitter for event-based architecture
- Listens to device add/update/delete events via Homey API
- Registers capability listeners for numeric, boolean, and enum types
- Maintains device and zone maps for context
- Emits 'capability' events with device metadata (id, name, zoneId, zone, value)

**lib/HomeyStateHandler.js** - Collects Homey system and app metrics
- Extends EventEmitter
- Polls every 30 seconds for CPU, memory, and storage data
- Can collect per-app metrics (controlled by homey_metrics setting)
- Emits 'state.changed' events with system metrics

**lib/InsightsHandler.js** - Exports Homey Insights data
- Only active when app metrics are enabled
- Retrieves historical data from Homey's built-in Insights feature

**lib/measurementsUtil.js** - Transforms events into InfluxDB line protocol
- Formats measurement names based on mode: 'by_name', 'by_zone', 'by_zone_name'
- Supports measurement prefix for namespacing
- Escapes special characters in measurements, tags, and fields per InfluxDB spec
- Handles boolean, number, and string field types
- Adds timestamp in nanoseconds

**lib/escape.js** - InfluxDB line protocol escaping utilities
- Escapes special characters for measurement names, tag keys/values, and field values
- Follows InfluxDB line protocol specification

**lib/Queue.js** - Queue implementation for buffering measurements

**lib/util.js** - Utility functions (e.g., delay helper)

### Configuration System

The app uses **Homey Compose** pattern:
- Source files in `.homeycompose/` directory
- Flow cards (triggers, conditions, actions) defined in `.homeycompose/flow/` as separate JSON files
- Base app configuration in `.homeycompose/app.json`
- Run `homeyConfig compose` to generate final `app.json` (do not edit app.json directly)

Settings stored via Homey Settings API (`homey.settings`):
- `host`, `protocol`, `port` - InfluxDB connection details
- `organization`, `token` - InfluxDB v2.x authentication (token-based)
- `username`, `password` - InfluxDB v1.x authentication (basic auth)
- `database` - Database name (v1.x) or bucket name (v2.x)
- `measurement_mode` - Measurement naming strategy:
  - `'by_name'` - Use device name
  - `'by_zone'` - Use zone name
  - `'by_zone_name'` - Combine zone and device name
- `measurement_prefix` - Optional prefix for all measurement names
- `homey_metrics` - Metrics collection control:
  - `'true'` - Collect both Homey system and app metrics
  - `'homey'` - Collect only Homey system metrics
  - `'false'` - Disable metrics collection
- `write_interval` - Seconds between InfluxDB writes (10-60, default 10)

Settings are managed via HTML settings page at `settings/index.html`

### Flow Cards System

The app provides Flow cards for automation and control:

**Trigger Cards:**
- `online` - Fires when InfluxDB connection is established
- `offline` - Fires when InfluxDB connection is lost

**Condition Cards:**
- `is_online` - Check if InfluxDB is online/offline
- `is_metrics_enabled` - Check if Homey metrics collection is enabled
- `is_app_metrics_enabled` - Check if app metrics collection is enabled

**Action Cards:**
- `enable_metrics` - Enable/disable Homey and app metrics collection
- `influxdb_write_interval` - Set write interval (10-60 seconds)
- `write_number` - Write a custom number measurement to InfluxDB
- `write_boolean` - Write a custom boolean measurement to InfluxDB
- `write_text` - Write a custom text measurement to InfluxDB

Flow cards are registered in `app.js` via `initFlows()` method and handlers are bound to class methods.

### Event Flow

1. **Device monitoring**: DeviceHandler listens to Homey API device events and registers capability listeners
2. **Capability changes**: When a device capability changes, DeviceHandler emits 'capability' events with metadata
3. **System metrics**: HomeyStateHandler polls every 30 seconds and emits 'state.changed' events
4. **Measurement formatting**: App receives events and calls measurementsUtil to format them as InfluxDB line protocol
5. **Buffering**: InfluxDb queues measurements (writes when buffer reaches 1000 or on interval timer)
6. **Writing**: Measurements are written to InfluxDB via HTTP POST
7. **Status updates**: Connection status changes trigger 'online'/'offline' events and flow cards

### InfluxDB Write Protocol

Measurements are written in InfluxDB line protocol format:
```
<measurement>,tag1=value1,tag2=value2 field1=value1,field2=value2 timestamp
```

**For device capabilities:**
- Tags: `id` (device ID), `name` (device name), `zoneId` (zone ID), `zone` (zone name)
- Fields: The capability value (number, boolean, or string)
- Measurement name: Based on `measurement_mode` setting

**For system metrics:**
- Tags: Predefined based on metric type (CPU, memory, storage)
- Fields: System values (usage percentages, bytes, etc.)

## Homey SDK Specifics

- **SDK Version**: Homey SDK 3 (configured in `app.json`)
- **Compatibility**: Requires Homey firmware >=8.1.2
- **Permissions**: Requires `homey:manager:api` permission to access Homey API for device and system data
- **Main Class**: `InfluxDbApp` extends `Homey.App`
- **Settings UI**: HTML-based settings page at `settings/index.html`
- **API Endpoint**: Provides GET `/status` endpoint for checking app status
- **Package Manager**: Uses npm (not TypeScript - this is a pure JavaScript app)

## Key Implementation Patterns

### EventEmitter Architecture
- All handlers (DeviceHandler, HomeyStateHandler, InsightsHandler, InfluxDb) extend EventEmitter
- Provides loosely coupled, event-driven architecture
- App coordinates handlers via event listeners

### Homey API Usage
- Establishes Homey API connection on startup via `HomeyAPI.createAppAPI()` from `homey-api` package
- Waits for device initialization before starting (`waitForHomey()`)
- API connection is maintained throughout app lifecycle
- Access to devices, zones, system info via API

### Dynamic Capability Listeners
- Capability listeners are registered/destroyed dynamically as devices are added/removed
- DeviceHandler maintains maps of devices and zones
- Listeners only registered for numeric, boolean, and enum capabilities

### Settings Management
- Settings changes are monitored via `homey.settings.on('set', ...)` listeners
- Settings updates trigger handler reconfiguration without app restart
- Initial defaults are set in `initSettings()`

### Scheduled Tasks
- Uses `homey.setTimeout()` and `homey.setInterval()` (not global timers)
- Ensures proper cleanup and lifecycle management
- Write scheduler runs periodically based on `write_interval` setting

### Cleanup on Unload
- `homey.on('unload', ...)` registers cleanup handler
- All schedulers, intervals, and listeners are properly cleaned up
- Prevents memory leaks and resource issues

### Error Handling
- Try-catch blocks around async operations
- Logging via `this.log()` and `this.error()` methods
- Connection status tracking for InfluxDB with retry logic

## Testing

Tests are located in `test/` directory and use:
- **Mocha** as test runner
- **Chai** for assertions
- Focus on testing utility functions (escape, measurements, queue)
