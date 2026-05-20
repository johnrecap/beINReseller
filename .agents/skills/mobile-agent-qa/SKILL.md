---
name: mobile-agent-qa
description: >
  Use when the user needs to interact with, test, or automate anything on a physical
  Android device. Covers QA testing, UI verification, flow automation, accessibility
  checks, and any task that requires controlling a real mobile device through
  natural language instead of manual tapping.
---
# Mobile QA Automation via droidrun

## Prerequisites

- `droidrun` must be installed: `pip install droidrun`
- ADB must be set up and the device must be connected
- Run `adb devices` to verify connection

## When to Use

- User needs to verify that a web app or mobile app works correctly on a real device
- User wants to automate a repetitive testing flow on Android
- User needs screenshots or recordings from a real device
- User is doing QA and wants to test multiple scenarios programmatically
- User needs to verify responsive design on actual mobile hardware
- User wants to test push notifications, deep links, or device-specific features

## When NOT to Use

- User wants to test in a desktop browser → use browser tools
- User is asking about CSS media queries → answer directly
- User doesn't have a connected Android device → this won't work
- User needs iOS testing → droidrun is Android only

## Scenarios

1. Verifying a login flow works end-to-end on a real phone
2. Testing that a responsive layout renders correctly on mobile screen sizes
3. Automating a sequence of taps and inputs to test a checkout flow
4. Capturing screenshots of different app states for documentation
5. Testing that push notifications arrive and display correctly
6. Verifying form inputs work correctly with mobile keyboards

## Steps

1. Verify device: `adb devices`
2. Run task: `droidrun "<natural language instruction>"`
3. Report results and any screenshots captured
