# InfluxDb support for Athom Homey

This app will log all numeric, boolean and enum capabilities to a InfluxDb database.

## Install:

The IP address, port number and database for the InfluxDb must be entered in app settings.

For InfluxDB 2.x, the organization ID and token must be set.  For InfluxDB 1.x they must not be set.

## Release Notes:

#### 1.2.0

- Updated to homey-api

#### 1.1.0

- Support for storing enum capabilities
- Added 'Write boolean', 'Write number' and 'Write text' actions

#### 1.0.0

- Updated to SDK3
- Updated settings

#### 0.9.14

- Can select between Homey and app metrics, or just Homey metrics

#### 0.9.13

- Added flows to enable/disable metrics and set write interval 

#### 0.9.12

- Fixed escaping of non-breaking spaces

#### 0.9.11

- Added tag_2 for export of CPU usage

#### 0.9.10

- Added triggers for online and offline events
- Added export of CPU usage per app
- Name for measurements can be prefixed

#### 0.9.9

- Handle adding several devices at the same time
- Updated Athom api.

#### 0.9.8

- Handle adding several devices at the same time

#### 0.9.7

- Name standard for measurements can be changed
- Zone id and name as tags

#### 0.9.6

- Support for InfluxDB v2 and InfluxDb Cloud

#### 0.9.5

- Minor fixes

#### 0.9.4

- Minor fixes

#### 0.9.3

- Improved settings page

#### 0.9.2

- Added logging of Homey metrics
- Added protocol, username and password to settings

#### 0.9.1

- Fixed timestamp for measurements

#### 0.9.0

- First version


## Disclaimer:

Use at your own risk. I accept no responsibility for any damages caused by using this app.
