# Deep Research Report

**Interaction ID:** `v1_ChcwNkJPYXRfTENLU3RrZFVQNV8yVzBBRRIXMDZCT2F0X0xDS1N0a2RVUDVfMlcwQUU`

**Status:** completed

---

# Akiflow: Comprehensive Research Report & Reference Wiki

Akiflow is a premium productivity application designed for knowledge workers, focusing heavily on task consolidation, keyboard-first navigation, and manual time-blocking [cite: 1, 2]. Research suggests its standout features are the Universal Inbox and the Command Bar, which significantly reduce context switching by aggregating tasks from dozens of third-party tools into a single, schedulable interface [cite: 3, 4]. However, its high price point ($34/month) and frequently reported issues with its mobile application and billing practices are notable points of friction among users [cite: 1, 5]. 

It seems likely that Akiflow occupies a strategic middle ground in the digital planner market—positioned between purely manual, mindful planners like Sunsama and fully automated AI schedulers like Motion [cite: 6, 7]. The evidence leans toward it being highly effective for desktop power users who are comfortable with keyboard-centric navigation and who suffer from severe task fragmentation across multiple project management and communication ecosystems [cite: 1, 8].

---

## 1. Complete Feature Catalog

This section enumerates the granular feature set of Akiflow, treating the platform as a comprehensive operating system for daily productivity.

### 1.1 Universal Inbox / Unified Inbox
The Universal Inbox is Akiflow's flagship data-aggregation feature. It acts as a single triage view for tasks generated natively within Akiflow and those imported automatically from over 3,000 integrated tools [cite: 2, 9]. 
*   **Functionality:** Instead of checking email, Slack, Asana, and Jira separately, users open the Universal Inbox to see all flagged emails, assigned tickets, and saved messages in a unified feed [cite: 1, 10].
*   **"Inbox Zero" Processing:** The intended workflow dictates that users process this inbox twice daily. For each item, the user must make a decision: if it takes less than two minutes, execute it immediately and press `E` to mark it done; otherwise, press `P` to schedule it on the calendar, or press `Cmd+S` / `Ctrl+S` to defer it to the "Someday" list [cite: 11]. 
*   **The Triage Flow:** As tasks are processed, they disappear from the Inbox. Because of two-way synchronization, modifying or completing a task in the Akiflow inbox reflects back in the native application (e.g., checking off a Todoist task in Akiflow marks it complete in Todoist) [cite: 1, 12].

### 1.2 Command Bar & Keyboard Shortcuts
The Command Bar is Akiflow's power-user interface, built to eliminate reliance on the mouse [cite: 2, 10]. 
*   **Summoning:** The bar is a global floating text input summoned via keyboard shortcuts like `Cmd+K` or `Opt+Space` (or `Ctrl+K` on Windows) [cite: 2, 13, 14, 15]. It works system-wide, allowing users to capture ideas without switching away from their current application [cite: 2].
*   **Quick-Add Syntax & Natural Language Processing (NLP):** Users can type tasks in plain English, and the system parses the metadata. For example, typing "Today 3 pm call with Sarah about project" automatically sets the task title, schedules it for 3:00 PM on the current day, and calculates the duration [cite: 14]. The NLP engine understands relative dates (e.g., "next Friday") [cite: 16].
*   **Navigation and Execution:** Beyond task creation, the Command Bar serves as a navigation and action hub. 
*   **Core Keyboard Shortcuts:** Akiflow is strictly keyboard-first. Critical shortcuts include:
    *   `P`: Schedule a task (opens date/time picker) [cite: 11].
    *   `E`: Mark task as done [cite: 11].
    *   `F`: Enter Focus Mode [cite: 11].
    *   `C`: Create a new task [cite: 11].
    *   `H`: Mark task as a high-priority "Goal" [cite: 11].
    *   `G`: Jump to any project, section, or date [cite: 11].
    *   `O`: Open all external links attached to a task [cite: 11].
    *   `U`: Access the Upcoming section [cite: 17].
    *   `Cmd+A`: Select multiple tasks for bulk actions [cite: 18].

### 1.3 Calendar & Time-Blocking
Akiflow merges task management with calendar management, operating on the philosophy that tasks without dedicated time blocks rarely get executed [cite: 8].
*   **Views:** The interface offers Overview, Day, Week, and Month views. The Week view is heavily emphasized for time-blocking [cite: 17, 19].
*   **Calendar Overlays:** The calendar aggregates events from multiple connected Google Calendar and Outlook accounts, placing meetings and tasks side-by-side [cite: 20].
*   **Drag-to-Schedule:** The primary scheduling mechanic involves dragging an unscheduled task from the Inbox or a "Today" column directly onto the calendar timeline. Dropping the task creates a visual time block [cite: 2, 8].
*   **Calendar Locking:** Users can "lock" tasks to specific calendar accounts. This creates a busy event on the actual Google/Outlook calendar, protecting that time from colleagues trying to schedule meetings [cite: 2, 9].
*   **Time Zones:** A shortcut allows users to display multiple global time zones side-by-side on the calendar grid [cite: 21].
*   **Schedule Optimizer:** A recent AI addition allows users to auto-replan their day. If a task runs long, clicking a button allows Akiflow to reflow the remaining tasks into available slots automatically [cite: 18].

### 1.4 Tasks Properties & Actions
Tasks in Akiflow are treated as rich objects rather than simple text strings.
*   **Task Properties:** Every task can contain a title, description, planned time, calculated duration, recurrence rules, priority level, status, deadline, and embedded links to original content [cite: 9]. 
*   **Deadlines vs. Scheduled Dates:** Akiflow strictly separates *when a task is due* (deadline) from *when a task is done* (scheduled date/time slot). However, users have criticized the app for lacking a time-of-day component for deadlines (allowing only date-based deadlines) [cite: 1, 6].
*   **Subtasks:** Introduced in version 2.76, users can break complex deliverables into nested checklists and subtasks [cite: 18].
*   **Bulk Actions:** Users can select multiple tasks (e.g., using `Cmd+A`) to assign labels, schedule, or snooze them simultaneously [cite: 18, 22].

### 1.5 Rituals / Routines
To prevent the system from becoming a disorganized repository of deferred tasks, Akiflow relies on guided, step-by-step "Rituals" to force self-automation and system maintenance [cite: 11, 23].
*   **Daily Planning (Morning):** A 5-to-10 minute workflow where the user reviews yesterday's performance, sets 1-3 primary goals for the day, clears the universal inbox, and time-blocks the day's schedule [cite: 11].
*   **Daily Shutdown (Evening):** Based on the psychological concept of the Zeigarnik effect (achieving closure to prevent rumination), this ritual walks users through reviewing completed work, replanning undone tasks, and preparing the workspace for the next day [cite: 11, 24, 25].
*   **Weekly Planning:** A broader ritual involving: 1) Reviewing last week's completed and overdue tasks, 2) Reviewing last week's goals, 3) Writing new weekly goals, 4) Jotting down reference notes, 5) Moving tasks from the Inbox, Month, or Someday lists into the active week, and 6) Time-blocking the week [cite: 26].
*   **Weekly Shutdown:** A 5-minute Friday review to analyze time-spent statistics, rate the week, and wrap up loose ends [cite: 26, 27].

### 1.6 Time Slots & Availability Sharing
Akiflow replaces dedicated booking software (like Calendly) with native availability sharing [cite: 3, 8].
*   **Booking Links:** Users can quickly select open blocks on their calendar and generate a scheduling link. Invitees can book one-off or recurring meetings within these parameters without disrupting the user's pre-planned time blocks [cite: 7, 9].
*   **Time Slots:** Users can create recurring templates for types of work (e.g., a "Deep Work" slot or an "Admin" slot). Tasks can then be dragged into these specific slots [cite: 2].

### 1.7 Focus Mode & Current-Task Banner
To combat distraction during execution, Akiflow includes a "Focus Mode." 
*   **Trigger:** Activated by pressing `F`.
*   **Behavior:** Focus Mode hides the calendar, inbox, and all peripheral UI elements, taking over the screen to display only the specific task currently being worked on alongside a built-in focus timer [cite: 3, 9, 11].

### 1.8 Snooze, Defer, "Someday", and Recurring Tasks
*   **The "Someday" Page:** Akiflow recently removed its traditional "Snooze" feature, replacing it with a robust "Someday" page and "Time Frames." Tasks that are not actionable immediately are sent to Someday, removing them from the active calendar but keeping them sortable by priority, age, or project for future Weekly Planning sessions [cite: 28].
*   **Recurring Tasks:** Users can set complex recurrences (e.g., every first of the month). Recurring tasks sync directly to Google Calendar as recurring events without creating duplicates [cite: 16, 21]. 

### 1.9 Labels, Priorities, and Organization
*   **Smart Lists & Tags:** Custom labels allow users to filter and color-code their day visually [cite: 21]. Akiflow introduced "Smart Tags" that can auto-categorize tasks into Work or Personal buckets based on AI heuristics [cite: 18].
*   **Priority Flags:** Tasks can be escalated to "Goal" status, giving them visual prominence during daily and weekly planning [cite: 21, 26].

### 1.10 Notifications & Desktop Reminders
*   **Tray Notifications:** A system-level tray or menu bar app keeps the user's current schedule visible at a glance without opening the main window [cite: 21].
*   **Smart Meeting Alerts:** Akiflow delivers real-time desktop reminders before meetings. These alerts include a one-click "Join Meeting" button, eliminating the need to hunt for Zoom or Meet URLs in calendar invites [cite: 9, 21, 29].

### 1.11 Search
The platform features universal search (accessible via shortcut), allowing users to query tasks, calendar events, meeting transcripts, and contacts instantly [cite: 8, 29].

### 1.12 Cross-Device Sync, Offline Behavior, and Apps
*   **Platforms:** Akiflow provides native desktop applications for Windows and macOS, a web application, and mobile apps for iOS and Android [cite: 21, 30]. 
*   **Offline Mode:** The desktop applications feature robust offline functionality. Users can process their inbox and plan their calendar without an internet connection; changes sync automatically once connectivity is restored [cite: 2, 9].
*   **Mobile App Limitations:** While the desktop app is highly praised, the mobile app is frequently cited as a weakness. It is primarily used for quick task capture and viewing the "Daily Dashboard" (a recent addition showing morning/midday summaries) rather than complex schedule manipulation [cite: 1, 18].

---

## 2. Every Integration

Akiflow is built on the premise of extensive consolidation. It supports over 3,000 tools, heavily relying on native connections for the most popular enterprise software, supplemented by Zapier and IFTTT [cite: 2, 31]. 

### Native Integrations
For native integrations, Akiflow generally utilizes **two-way sync**. If a user completes, modifies, or schedules a task in Akiflow, those state changes are reflected in the host application [cite: 1, 12].
*   **Google Calendar & Outlook Calendar:** Two-way sync. Events are pulled in to create the visual time-blocking grid; tasks dragged onto the Akiflow calendar create actual busy blocks in Google/Outlook [cite: 7, 21].
*   **Gmail & Outlook Email:** Pulls in emails that the user flags or stars, converting the email body into a task description and providing a deep link back to the email thread [cite: 6, 31]. Akiflow also supports routing emails through **Superhuman** or Apple Mail on iOS [cite: 18].
*   **Slack & Microsoft Teams:** Users can turn saved/starred messages into tasks. (Note: Some user reviews suggest that while most tools are two-way, Slack and ClickUp syncs sometimes function practically as one-way pipelines into Akiflow) [cite: 6, 27, 31].
*   **Todoist:** Two-way sync pulls projects, labels, and scheduled tasks into Akiflow. Completing the item in Akiflow checks it off in Todoist [cite: 12].
*   **Notion:** Imports Notion database items assigned to the user [cite: 8, 31].
*   **Asana, Trello, & ClickUp:** Syncs project management boards, tasks, and deadlines directly into the Universal Inbox [cite: 7, 31, 32].
*   **Jira, Linear, & GitHub:** Developer-focused integrations that pull assigned issues, pull requests, and bug tickets into the user's daily plan [cite: 31, 32, 33].
*   **Microsoft To Do & Google Tasks:** Basic task list synchronization [cite: 31, 33, 34].
*   **Zoom:** Allows users to schedule meetings and pull meeting links directly into the calendar [cite: 21, 31].

### Automation Platforms
*   **Zapier & IFTTT:** For apps without native support (e.g., Evernote, Things, HubSpot, Salesforce), Akiflow relies on Zapier and IFTTT Webhooks to push triggers into the Akiflow inbox [cite: 34, 35]. 

---

## 3. Developer / API Surface

Akiflow’s developer ecosystem has undergone a significant architectural pivot. 

*   **Historical Lack of a REST API:** For years, power users and developers actively requested a public REST API on Akiflow's community boards. Users wanted to extract statistics, build custom dashboards, or perform bi-directional syncing with niche tools. Historically, Akiflow refused to provide standard API keys or endpoints, forcing developers to rely on third-party middleware like Zapier, Latenode, or Workload webhooks to push data in and out by hunting down hidden Inbox UUIDs via browser developer tools [cite: 36, 37, 38, 39].
*   **The Model Context Protocol (MCP) Server:** In a major shift during the Summer of 2026, Akiflow addressed the interoperability gap not by releasing a traditional REST API, but by launching a hosted MCP server (`mcp.akiflow.com`). MCP is an open standard that allows AI assistants (like Claude Desktop) to connect securely to local or remote data sources [cite: 18].
*   **Capabilities via MCP:** Through OAuth authentication, external AI clients can now interact with the user's Akiflow account in natural language. The AI can read the user's schedule, create and edit tasks, place time blocks on the calendar, manage multiple calendars, and pull meeting transcripts directly into AI workflows. This allows third-party developers to build agentic workflows on top of Akiflow's data structure without needing discrete endpoint routing [cite: 18, 22].
*   **Webhooks:** Users can still configure incoming webhooks via Zapier, IFTTT, and Make to route JSON payloads from unsupported apps directly into the Universal Inbox [cite: 40, 41].

---

## 4. Changelog History & Feature Evolution

Akiflow’s trajectory reveals a shift from being a simple calendar/task aggregator to an AI-assisted daily operating system [cite: 18]. 

### Evolution of "Aki" (The AI Assistant)
*   **Late 2025 (v2.64):** AI integration began lightly with Siri voice commands, allowing users to capture tasks via natural language [cite: 18].
*   **March 2026 (v2.68.5):** The introduction of the **Aki Meeting Assistant**. The AI was upgraded to auto-join Zoom, Meet, and Teams calls, record transcripts, generate summaries, and extract actionable tasks directly into the inbox [cite: 18].
*   **June 2026 (v2.76 - Summer Release):** Aki evolved from an internal feature to an external protocol via the MCP server, granting full schedule control to third-party LLMs [cite: 18].

### Major Release Milestones
*   **Version 2.59 (Oct 2025):** Focus on mobile feature parity, introducing Live Activities for iOS/Android to keep current tasks visible on lock screens [cite: 18].
*   **Version 2.71.8 (April 2026):** A major stabilization release. Fixed notorious bugs with recurring events randomly changing, improved Google Calendar sync reliability, and refined the natural language understanding of dates (e.g., properly parsing "next Friday") [cite: 16].
*   **Version 2.76 (June 2026):** Marketed as the biggest release of the year. It shipped four major features: 1) The MCP server, 2) Native Subtasks (a long-requested feature that was previously a major reason for churn), 3) The Mobile Daily Dashboard, and 4) The **Schedule Optimizer**, a feature that allows Akiflow to auto-replan the rest of a user's day if a task runs over its allotted time [cite: 18]. 

*Trajectory Analysis:* Early development focused entirely on manual control and exact-hour placement. The recent addition of the Schedule Optimizer and MCP indicates that Akiflow is cautiously introducing automation to compete with tools like Motion, while still keeping the user in the "approver" seat rather than fully relinquishing control to an algorithm [cite: 7].

---

## 5. Blog Themes & Product Philosophy

Akiflow’s content marketing and blog (akiflow.com/blog) heavily preach a specific, structured methodology for productivity [cite: 21, 23].

*   **The "Single Source of Truth":** The core philosophy is that "everything that takes time belongs in one place." Akiflow argues that context switching (jumping between Slack, Gmail, and Jira to figure out what to do) is the primary destroyer of deep work [cite: 2, 15, 42].
*   **Time-Blocking over To-Do Lists:** The blog frequently contrasts traditional task management with time-blocking. Akiflow posits that a to-do list without a calendar is useless because it does not account for the finite capacity of a workday. Tasks must be assigned a physical block of time to guarantee execution [cite: 8, 43, 44].
*   **Inbox Zero & Triage:** Akiflow treats tasks exactly like email. The goal is not to leave tasks in the Universal Inbox, but to process them to zero daily—either by doing them, scheduling them, or deferring them [cite: 11].
*   **Self-Automation via Rituals:** A recurring theme is the necessity of "Rituals." Akiflow’s philosophy relies on the idea that human memory is flawed, and end-of-day anxiety is caused by "open loops." By practicing daily planning and shutdown rituals, users offload the cognitive burden of remembering tasks to the system, enabling psychological detachment from work in the evening [cite: 11, 24, 45].

---

## 6. Why People Love It / What Makes It "Naturally Good"

User sentiment across G2, Product Hunt, Capterra, and Reddit reveals a sharply divided user base: those who adapt to its keyboard-heavy workflow become evangelists, while those expecting mobile parity or automated magic churn quickly [cite: 1, 5].

### Specific Praises
*   **Keyboard-First Speed:** Power users consistently praise the Command Bar and the global shortcuts. The ability to hit `Cmd+K`, type a thought, and have it categorized and scheduled without touching the mouse is cited as the app's most "magical" feature [cite: 2, 3, 4, 10].
*   **Consolidation (The Job to be Done):** The core value proposition is curing tab-fatigue. Users who previously managed tasks across five different apps praise Akiflow for genuinely saving them 30 to 60 minutes a day of administrative overhead [cite: 1, 4, 5, 46].
*   **Visual Drag-and-Drop:** The tactile satisfaction of dragging an email from the inbox sidebar onto a 2:00 PM calendar slot is widely praised as intuitive and stress-relieving [cite: 3, 7].
*   **Onboarding:** Users frequently highlight the helpfulness of the 1:1 onboarding calls provided by the customer success team during the trial phase [cite: 1, 7, 47].

### Common Complaints & Reasons for Churn
*   **Steep Pricing & Billing Practices:** The $34/month price tag is the most frequent complaint. Furthermore, multiple reviews on Trustpilot and Reddit describe "billing nightmares," with users reporting being charged for $228 annual renewals without warning, coupled with a strict refund policy [cite: 1, 5].
*   **Mobile App Deficiencies:** Across platforms, the mobile app is viewed as an underdeveloped afterthought compared to the highly polished desktop experience. It suffers from bugs, sync delays, and limited planning views (e.g., lack of a proper month view) [cite: 1, 5, 16].
*   **Missing Core Integrations:** Despite supporting 3,000+ apps via Zapier, the lack of native support for Apple Calendar (iCloud) and Fastmail remains a dealbreaker for ecosystem-specific users [cite: 3, 48, 49]. 
*   **Over-Engineering:** Some users report that automatically piping every email and Slack message into one list creates overwhelming visual clutter, turning the app into a source of anxiety rather than relief [cite: 50].

### Competitor Contrast
*   **vs. Motion:** Motion is algorithm-driven; it looks at deadlines and auto-schedules the day. Akiflow is manual and precise; the user places the blocks. Motion is better for chaotic, dependency-heavy team workloads, while Akiflow is better for individual contributors who want strict control [cite: 7, 51].
*   **vs. Sunsama:** Sunsama enforces mindful, manual daily pulls of tasks and explicitly discourages over-scheduling. Akiflow is built for speed, fast triage, and high-volume automated task capture [cite: 6, 14, 27].
*   **vs. Morgen:** Morgen is significantly cheaper ($15/mo) and offers background AI planning, but lacks the deep ecosystem integrations and Command Bar speed of Akiflow [cite: 27, 48].
*   **vs. Reclaim AI:** Reclaim focuses heavily on team-based scheduling and protecting habits across a company, whereas Akiflow is almost exclusively a single-player personal productivity tool [cite: 47].

---

## 7. Pricing & Plans

Akiflow is positioned at the premium end of the productivity software market. There is no permanent free tier [cite: 46, 51].

*   **Pro Monthly:** $34 per user / month. This no-commitment plan is considered one of the most expensive individual subscriptions in the space [cite: 1, 51, 52].
*   **Pro Yearly:** $19 per user / month (billed annually as $228). This tier offers a 44% discount and includes a free 1:1 onboarding call [cite: 8, 48, 52].
*   **Believer Plan:** A legacy/long-term commitment plan historically priced at $14.90/month (billed every two years) or $8.33/month (billed every five years for $500). Availability to new users may vary [cite: 4, 51, 53].
*   **Teams Plan:** Priced at roughly $60 per year per user (though specifics often require a sales consultation), offering collaborative workspaces and advanced admin tools [cite: 53, 54].
*   **Discounts:** Akiflow offers a 50% discount for students/researchers (with a valid .edu email), military personnel, and healthcare workers. They also offer a referral program granting $25 in credits [cite: 4, 29, 48, 52].
*   **Trial:** A 7-day free trial is available. Booking a 1:1 onboarding call during this window extends the trial to 14 days [cite: 48, 51, 52].
*   **Add-on Costs:** Certain premium AI features, such as the Aki Meeting Assistant (transcription and summarization), have been reported by some reviewers as requiring an additional paid add-on, potentially doubling the monthly cost, though standard Aki Assistant features are included in the Pro tier [cite: 48, 52].

---

## 8. UI / UX Design Language

Akiflow’s interface is designed for power users, prioritizing high information density without visual clutter. The design language is characterized by speed, stark contrast, and keyboard-first accessibility [cite: 8, 55].

### Macro Layout: The Three-Pane Interface
A designer recreating Akiflow would build a three-column dashboard:
1.  **Left Sidebar (Navigation & Inbox):** A collapsible, narrow vertical pane. It houses the user profile, settings gear, and high-level navigation (Inbox, Today, Upcoming, Someday). Crucially, the Universal Inbox lives here, displaying a vertical list of unscheduled tasks pulled from integrated apps. Below this, a mini pie-chart widget visualizes the day's scheduled time vs. available time [cite: 8, 17].
2.  **Center Column (Timeframes & Triage):** The main working area. Depending on the view selected, this pane displays vertical columns for "Today," "This Week," and "This Month." Each column lists tasks as draggable cards. The typography is clean and sans-serif, maximizing readability for dense lists [cite: 8, 17].
3.  **Right Column (The Calendar):** A standard vertical calendar grid (resembling Google Calendar). It features hour markers on the Y-axis. Current time is denoted by a horizontal line (the "Now" indicator). Overlays from different accounts are color-coded [cite: 8].

### The Command Bar
The Command Bar is a floating modal that appears in the center of the screen, dimming the background (similar to Apple's Spotlight or Raycast). It features a single, large text input field. As the user types, the bar uses NLP to highlight dates and times in a distinct accent color. Below the text input, a dropdown list auto-populates with command suggestions (e.g., "Create task," "Schedule," "Search") or recent projects, navigable via arrow keys [cite: 2, 13, 15].

### Visual Aesthetics & Theming
*   **Color Scheme & Dark Mode:** Akiflow supports both light and dark modes. The dark mode utilizes deep grey backgrounds (e.g., `#121212`) rather than pure black to reduce eye strain and allow colored calendar blocks to pop without visual vibration [cite: 8, 56]. Accents are generally subtle, relying on user-defined labels and native app icons (e.g., the Slack or Gmail logo) appended to task cards to denote their origin [cite: 5].
*   **Micro-Patterns:**
    *   **Drag Handles:** Hovering over a task card reveals a six-dot grip handle, indicating draggability.
    *   **Snackbars:** Brief, non-intrusive notification toasts appear at the bottom of the screen to confirm actions (e.g., "Task scheduled," "Meeting transcribed") [cite: 18].
    *   **Inline Editing:** Clicking the edge of a time block on the calendar allows the user to drag it up or down to adjust the duration seamlessly, dynamically updating the task's properties [cite: 8, 19].

### Representative Screens
*   **The Rituals Flow:** When initiating a "Daily Planning" ritual, the three-pane layout is replaced by a focused, wizard-like modal. It walks the user through a sequence of minimalist screens: first showing a list of yesterday's tasks to review, then presenting an empty input field to declare today's 1-3 primary goals, and finally transitioning back to the calendar view to time-block the inbox [cite: 11, 26].
*   **Settings / Integrations:** A standard master-detail view. A left-hand list of available tools (Slack, Notion, Zoom) pairs with a right-hand pane containing OAuth connection buttons, toggle switches for specific sync rules, and webhook generation fields [cite: 31, 39].

**Sources:**
1. [saner.ai](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEZdQWNRoSPlzA5n8UpOant3OqxCVy4ymDkbtHr5cRH9EeB_eQhGluE3-Cf6nkv4LesIAeUPmtkDZs9_U6ciD-BnOGIGJBOmjG-9iIG1gtjo5CIUoLKVOUMMAmXjMLHzCQ=)
2. [toolstack.io](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEveZJzMLHiuWo3WvlkST5qkKurZWnKupjcwnUK-H4pjnfZeRd2StoZc28mKFDxDpMaxja3pun0sflW8_zfLcSM0BXTwBvf3f-rCTkiQ0t96W4u-N47Fnt5)
3. [appliedai.tools](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGS6GLrsiK9P5xqhtbIafqqlKgqYABuoS-VQX_C-EdnQ_yyuM1bPrJx52ZowXLpBRSc5qL5OQxLlEnKfVAljJYqtQvDCPoQ_-NivoJUBkiD8PPzQ27yVuTgWtdOTpxXqaGz2oc8vq61a7BgSMpF4zjenDCARypAILUzParVUxiWbD6u3sjjgE9IjIOsYns=)
4. [productivewithchris.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHpAk0jT_c9kSTGDuf-LsglzRYHSo-Ac7HH4JoAq3lh7xYWztCTU2L8B1fdT89Tk3pkUzNLX42onvA8RkwUQBn3UlUUBf-ikcs0HUbLmKhJfhuJIR7XaSjlcQ80nuZtpkWeaL3aOBA9Zb0hNb0XU72ETJIEgfiu)
5. [toolguide.io](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFeIcrjnRx-L5N64LbmlL6hXPeReV8UY_H6BtdpserCzSiHq7ZDFkBVJuKf-jOOG7dqE9wX_bSN8WheZKBG0IR8KrSwPOQHJizR9IxwtFrd9X9Waquh8xMAmlzr)
6. [saner.ai](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGqalsXSUF51DCWABxLpHj8iHC6lo6c12f0A2_qIYt5rZaG7SvlFzsqcfEotDVaYuywOLujY4fLMdPRmlQ5LJdpMn3Jlh6MVEZOAg32OV52_orWbkF7g772boBF0y7fy4CwW9c=)
7. [morgen.so](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEAJ_2syOWK2nxmw9MAjpEIQKZeyTPHfbHpWuJiRFhjmvzxby7Wik_cDzXpb79cAY0zzme7Z4apvqjFja7CKFShAM3-DYzuMqHjQd-HtMIcpjtychReZFvRfVzdTIstmKcwHfHwmh8NKg==)
8. [dhruvirzala.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHzDAG3Tg4VzMG1NQJ1DRcjdN7qN0pnC5pBuG5JvoBse85kjHoYvhOkDJou-0bWXcXjVWGR8NtILZcNdaoPfQN8RPW2iNuPpEVOu1tUw8F613BrUNrln3OPqw-S6O8=)
9. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE8H5nhMDVpJ-AbLQAxgcTkazEcO_6eD0x1rWZW5uEySejzWKywipFqflGtD1oHBMOO65uA447Ra-oFq0BZ1V8GO0chrm3MUA4sg3v8qFJ9G9pW)
10. [catchagent.ai](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGfpjfHYtwvEnaTy1CLhTQ0LUs64SySBnE-TPYj2B8F-OkRbhyjAFSbb8GdzUhTdOtO7_T5XcE-w4I6ORMulKdfT_NIDdd51HvzEpaZ2J5_1uLMy21wfp2BJxUgC1MKuFYsyOGIjotRpC11cQ==)
11. [dawid.ai](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFPofwvrWqAZoxPOrpszZcQAKrfYtPIjwP-Jlz2aGAnRw9Zs2hv47rTgkHFdEOOsu_p_PFYITpK8vpmY7o2ZPzmMbd79qEW3Y6AOvpvGBG5AU5zZ4xYsGlGDaDcBO2VCoPconuxgR0=)
12. [todoist.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHcCfKFkDa2WE96j5K6wHMnPTYtq4RafU67IlwKRh8akc-773r_6USLXukZGvwV3O7bwnaII_h1EtI7bHtZUsqln5I8HOeR2CFezkAjiQaUpKsP_3yjdhQrOXlExW4zKdzLtL4W5dxI)
13. [medium.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQG4l_uMbRPb5XLSJxBkXckh0Ayb9ak3JO8aB_jTCOBKffO5AvUVpKeIYVq1w7dCQVzxrBc_-LglxeMw1KzdK_7N_6Wtq4H0n5Q5Msyh0GTwiw-lHyChHQN4jPEnkJLxW_E8ugEyzVlCIUXr325A_pRTq1RJUuu5wUscFyK_IOnxQEVEZ7f-Dr-fvla4fqsV)
14. [squeezegrowth.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGzUoXXTL69PiocrV2sLza94P6rWpJToiUCzcZVVQ7zNuTrxMVEdrUokXNbULmr5n1vWL17yPjs8l4PQWo8bvqHjbXcq3JR9IcQJSH8sHO8059EIvMPxHu3eWGyv7JE0ayd4Ru3f3f0zs5z)
15. [nesslabs.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFSQDOjttNaNw-GDb9tawhCKnhE7XNJJqZ7WQWeL8VJZJKZsLcIHmXh_uZTbgp_4GgSy2Qs68lMpvJ6jCQx-H8JlSXLPmH-H9jq-wdla9BT0jxLnuhL5XmG5lZYIoUQRZw=)
16. [reddit.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQExAKp8LD0MfJolAJeAkt5T_qePXi4JqTjdNQmv68vkvSZn3NSyhZKNQMzlqpSzLMCZaj3JdBZZyLobVaaXmnFzHA9Sd7Dm2I7-PV9PH2OrhuSJySSysXrQGajN23qWewQJrsuzCnXYi4JFfVQw71bH7moDb1V0Kg==)
17. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGjtF821joztx4DGlG3xhNAdQVeihFL2g82p5okPnpEVzymZq11dhe3Qjte6-dfmBxGK40jI1wbdfkS808DSUGNqHr5CMSLjPtgL4Lc27e7nT3RXLvkk-5M8Dw20XZLMcxXFzkjmN0dROMZGlPGX7Qm8T_QSec=)
18. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQH3u3blymfJRm0I9weFXPeJ9o8omFqJm5N5_RmmJjRxkzdjnkxdJwUblCrX9c3vLU3_z9Aajgjs52TyfpBKlPHaG0kDx1R5XHcOqoiBSVBMzlgMDXPMiUeBmjeX)
19. [todoist.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE3Fa5bq8NuUSJyrZpCHwIISfrfmAYJJwWntP7mAmeBAWTBndDQnoyFG0pdz7WfZVyKXhYf7uozRqfHNrHzrwynNQlQmE51tgdI5Rk2kP-LIbS_dY6FRfglaj_k4h8cpwIpydRF4h4r_dCCQwPi1zff)
20. [thebusinessdive.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGZmC3jwv2q1nhQ3Vzwq6LmeZmGi6CfHIu0WKirWGm3auYi92j16eP0NsVBw_GDzx17xHamS5FUz-isZDHeOKQc_XEv0OPDfC90dfQM0gKrF11tUhBzHe0NkVInVsoQT6uUZRoA_pUIM8yQ)
21. [getapp.com.au](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFdoHdz5eP1RBnDVWTzP8CYaaSjfT7H4i6SBonYMc9h-6NbH4m90J6qnO-Vtm3teMl3ij8BKHmt2zHhw8e1bVDqvVnXBMYdRLdNor6aEZ4iZMKi0BurVqEnI84wC5IacJJER-29_SLNEg==)
22. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFnpP2CQQArvDgsOh2x1610UumD5n0USW1cAH-yy7vtckWjGh4ln-yR-MnWM8bG7BFPDoUCHl92d79Ll7IVJn4XmNp-bzaOL8nLuxP8qE31wKO3QJ6VGUoRf56iqSn1nYLaVVHd)
23. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGGwNt4Ciq9uD_gk_EWqc6qobfUwfs7TN3JiHBTF8Trt5YZD3GTatGrVu2qqT7dWSOevEcbFgdHCqB_UhM1cCaMTBogFaktDz2mIEDH9GEMr8CD1JhqmMKwZ9k=)
24. [simplypsychology.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHqQraj55by7TXOpb2PUlpvpraHDIYThMmayaUj9qbcTOI1vxLd5II2exaU4g2odt-Ohow8Xs4vVReS-YUSytBfubSEYzLB83PHtnNUlDfqjHCKSfIxR9p0KrZNoDCHi8AArsseW1JI9WhwDA==)
25. [focused.space](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE4amXPFLOFiHjke3pE-PrbsFRH763j4oxOsjGuGsPaai63QX016wyURLTg6u932SMd9JgHlrgtXT2zMCHUAK1GT5ZYcI1KtEDvtc5kXedqBtUvTf4Da6sIppDN3cJ_6docEhhfvyezs44PAmGWHN8DF-hYKFXXmhAl1oSduR7X-ag12XaIOwKG7hnMGrp7CM3Ucg==)
26. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFYKXsaaKwqBSwd1eI0UPGIUyTEPcrXyUcjs9D-uAYdt4rBNngvXAUOi9JjzkNxIU1P0s4sh21K07cs8jgrr1fIv544tP-0gIKHUDWD9oxrMSTwKEssJyGvE0StLpil24diETQD9AEVeb-hGZosfR0=)
27. [morgen.so](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFyExYQpvcHEprnV-aSh5xfKFTb4bYbbXQweTuMB3L-9OuhHwZoTQYOGpKpkNeA6tvAD5blaYlRU10L7zy9zZ2Xu8tgfLesx-TgtZvTlaYlLZCG03Wis1eQeq0ieButvGhXuGcN7ewJUXobMeE=)
28. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHxYr4tDMOZvcL1v1hFF51hJCBV0gdpXrxomqfF2ECNIzzGIMlS8oYWkOf4HAUHdbVYdCbmvKhj5VfIwxrX6K0-x45BVe8n3GlRgZLVMO3WxqPbqgNmfm84U3pak9zld_EwWUPE7m7b)
29. [ellieplanner.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGuyGdVXDau4np9izVBRAIzq3o_Z24YvdK_KT5wT_ZhyERYEdx--AW_rX53DDQsCIKrFTIwXjS2v7J2hEGAgYypfftX60XXBjzD_wDCBMZlzqbi6ymxEICvpve3p2c79lQRa7LO9iDKM45cBmTuEaNLny8D)
30. [apple.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQENzjhyN3ZVnh7GWcdMS8OXvy2Ehd5RnsUA9h4OT87PnOXpHtQkGFkfXr8xrH9z8WA4kYH8IsUNRG3jDlf5l5axDyDvrzJ9p0g5VZlyf1qgVgMGTp7lubYY9wOdSC1CZPZfTl1bMm0WZ5tut9T4YyKp_br_oBMDT5knkkGc)
31. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHCkoGtr2zK0VUBAcdyEZ65DVwrRjGOsqU2ix2-5IPjOhTzRY4h2TpBvtPOqR_LzBW5qijCfLchdaMq3Bwyf6fXkQUEZFCgRES6AYVEjlIWrTM_r4xynRnUoe21-3QRXQL4LTiuhdtknJk2Mq3blWQrbdl3_cCDcw==)
32. [Link](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHZXNlXlVFrRqhPKoCe21SqDZ-IIyfNHpNLpY906LKtlQstUEhHUM0hXWBH4ei78zp3PYQYQhj4gB2bGCx4ISXMM0jG546HEjO_f_UL1DwyluLNqrb0Kw==)
33. [lindy.ai](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQH3TRhfetBOrjSiFQ2mZmfqqkBBDmNYVioBJJv9KQlHekfUoiBAh5YyOc4dcqtpb0VWqvXcDh4te6HEeaC-iK8g5tLm7cfnf5poewT-MAqY-4cGbUP-zZRdX3s=)
34. [zapier.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGPKO0N35V_rroLX9tOdYM2ukBgIuJsTnn1Z_l8KNVno_y2fa8KQpU1UctIshW4v740l7fxMoYAvSb9a_puMDoSlhrM1_-uIpGjijBr1PEW885oY1NS6rzyvOf59MDDIZjoag==)
35. [ifttt.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGAtyxSrAFE09a4pgnqweaH2SM-5HsycuOdaqLnu8tNy2BfLpQjeF59j9w939W4AtQ4rB70EX0OmZf0WD8Eq1ZVjoWNYf4k6e_gSQ-w3Ir4)
36. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFxLgywybftv1XXDOqaFhnG1ISnwq2JHnprzvK4MnzQG2ZFUw-Gi0xz7CfuFyqACvYFqmgfkyt9nXDihN29mlYb7Ip6CAYhzB5cY4LdPezQEsVeFhm_TiHVxKiRHE5xZkJValMpJtGEVJEH-H3fiHyJFsa1Q77NXuekIGWy4g==)
37. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQF33U_N_LzkW4b8ZgHAMLKe2gctOxdb0lc7NzRokGv5hO7OMidb9fLFqbmZsHACMVbtrY4ec7XIZKCdzkZRr_KrN1AIu7fTxbgJDJprEVl_ofLimi0_IOfFU5etKwYLzA==)
38. [reddit.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHww-WlccdS4zTGIYovJe8uWUimDx0AVsXn0chjKPz3aH3Q27XKtc1kNX_hAC7w7Pk8MqmbsRAH3nbNYtWOURYMsESoj_3ducPGzpowqRoOXOBYcItL0Lf9x5PA9Z1bfmnpHoeJj5RounJYoxlZb-EIANF4ihKw_jf61hp5JsOK2B3zAZN1aPtnzeE1-sq0)
39. [latenode.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQG12uW8kbaWn02q0lyxm_-bgpoSRAAKRfsiNvEceIK_0ludRisITK4JZR7CK6iZBEbjXAwoiN7X4EQ5ZW2TZZkbnCQY9N7Jmyhx7At7gDn3UJslYPcKpxiokqVXAEZT1aVLpJAwvBfeLvcG5HcKZvvulLmNGZxMBFgbfEghGLw271dDzkjXSUA9tRBCzrHjKtlUGIyWwsgG8n2UaQ9OnuUcz_HlQC4gaKpwePAVyKxt8q8=)
40. [workload.co](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHe0I-kmXhx7YOCUkx2uMp7J3bnkmH1OxUJhlCfzYikNZDlGBfDsBsI3DB_Qh3TQXxfkOKvFP4l1DhZv6Hoko7vmc_sySHqhEK_GXZ2iEfOq8Bn0gCtK8Qy1N_68LOBIL9djNInUBMDZri84ESKv_M=)
41. [tarvent.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQF1G7Uszr9_3XXnp2mB06tWFy9UCzNZPKfjnL5mfa4_CDYG3cM9UK0U16tfwf9rLDsyngqt7tuUn3ht8qjNUHp0dila0kLBPdSUrwUDJ9ICAtFBen1G4Pm6sIZWp8P4yby7Rw==)
42. [medium.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGLtRCONSAo9r9wisGbX8px8cp-gYTC3onL310gIui_STeZT3c6nSN9V5wGIZBK0FMMsRKns_DAQaMwomoMH1rGUKK-ihr1HLMxo1oZWuszO1acPdSrnoow1XFLBROBeG93gJYI13GkPya81Sr7Xc6DXGv6HS7y2GUCUV3ym8D3np1cHzuV0LrhVmVIWX4rdeWaez0=)
43. [meistertask.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEHYOKp2FgcQYi4Cn5sMDIukxE7juM69Jk35rxbiZrfJ31MmzI8w6IRz2VEn-DWQkKGRYGPKtUXsjV6rSomHV74U5qzvpCP7hh6ItZQfZxEEP2zptGoIJ5Dv_R3n2ASfFZGIz8l)
44. [toolfinder.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE6NPwcVgVNVTgG-fQNFabUzU51THozZbiG-qahrbrRbvkjZB4uZ3hRfZU3MNRvrDSR5OGumAgfSy5L5XhOHTiqpXl38IL8Wns65Yl30yOhtD6mgGJvNrZHCrAq_r-1EtN5SKys)
45. [fullfocusplanner.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE6uoFwXPeZE1YmsuLM256R9Ir9xgGlwqr6-S2waWwoSxz9HLYytAFvbVkGs7e3qnp_lIeJatW5HKg0WECQL-WHb95CW2GxJZokB4x2Hb7aT58Ikv_d1hcgorrNRv5vQ1ALz6lxyLAfBm0rCWkNiUGPqaBNE91ko_u-MA5OrnWpw9_hIlzNrMj8-04rX_AStDBdiXRZnwBtgAIp0ytS)
46. [lifestack.ai](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGus8tane1Z3xD4jBqQruzx9qTERsxk4XIBXZbl72Z9YHdh_CtisEuFJVUSIAHuDfYZ_gur6StqeSpDoRK-LkaRVGgP0N7GF4tU0wTmHJhy-xEpAisKAWI2wazq9JWP8A==)
47. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQErEhYUDbsxJBb9RdIbWWABWU1wX2RLTNkRLHJ55qSOlT2vULupa7QnhEhqUdpjz-c6FHyrNEBJDyonDUfW7DR0MDKyKysn6fHWKc0r9qqsuCa1CbeadoJdnc95sF5THVCFhMLNHL3ZPL73rjWR9DnIpbLj6JmA8lwvyJsOfuCYdWS3zZ0=)
48. [morgen.so](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGWQYlVQgUiQj4kw5WPKeU_J-apDOogCkS45JvBQai08_EWckfyM4puqWF2f1pIVfF9P2GI4RIjIfnvbIbKczrJm6iTJlE07hOBxQ8LfjWKOxHFo5kw6cja-9uNrc0GHRZl_53OdHs=)
49. [reddit.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQESqqlrXw6mEMCNeLbh-xmw3rvEQtW8W8Zqzi2bgTW_xjAXcNXwgQuucwiCA8wUDCyFS7HppXb54PGhI-KBMrTtK90HGCY70Fin2n-8_Gqv87ehihCUx-fSgnt-wH5vjkF7wadQhANNsC5Ez-X9WksFHflWFcHTLmGZdONABEvLSFG1w1W-guGRchpEReHdU270fmc=)
50. [efficient.app](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHMfWUC5us0kWHY7O_hgf7yf_Kcq7jW6shYo-Qsi66Sh_iWWveB_H1XTsiMUtwDVCRx6iDxn8KsQlE5LeRJwWcgvzVpegCyo0sRaH0iMD8Fgg3_skotRWlg)
51. [get-alfred.ai](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFX8HUgEH_JEqRYwh3IqsUdYf59KFdNDr33kWmhQkZaBl3NDS2Al5-7EvEnxR6zptFBAxMcaSHtFK1pyL7bJ-D0ZuIPBFwy8lhe5ZiyW8JQlJUIChOFlO2dC1IY2ORTe3RJv5Gv)
52. [Link](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGQ6fo7oRPhRnoFB8VhnDkgdpxahOMSjuIqKVQRS7tpDfxWm1aWovgBoG5LqUwayXH32KSUNllRBP7EJfExVgTljdVbRm4gPdWvleVhLhPLyXY=)
53. [akiflow.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGfGjTxBllnZ0Tq8uYpc1r_0YwnlrATM_jJmQ0NhqQeIWSDcYQkjnwXIShEzTnpqcOoao27V0jgiJjMArEwm6cftsWxMnJ3dB-dZwEn8VUv2w1g01J_vruBw6zqKCJPdKE=)
54. [toolfinder.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEqN1Pe6pHtEt7p2ya7wWAzDI9g05ZTjp8eLjX3wkjX8IH1ChJzm9qDjtFNlhB7mGo8BpqgxmlstPlk86vgrsPBp4-0sHWZt2yHAtBwDfSJf7843Al9G2frdUMEKf8mZtVj0KuP)
55. [reddit.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFEaitma-cWXGJqpvmgGjWqhworJIFbMJg3kRwZTYearKIIcdUsYYlGdFCX56ILXNI2BZpvN3LRgCyNO8aTPpbuADnhcHx875lgsW8bKi0Sz6HmdR9cax8mWZGZ8eeaM2FN9NnNxe37pQjx93B-ixwKgc7xenD7IqlBiVZXRY3i1b_E-a5031SawUuzcHF9MF18l2_8Q7ljzdzhJ-3BEFtqkw==)
56. [material.io](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFD88cyiNSammPddCu5e-VMr3ganPTrKWfgc4VPxnxX1CyC5wPfFf2FHsYKYSqaVPohM4KiH-hR9zTRSoO5Zouxd7_fPYL2XAu8bKYfO_FuaeH9d1OK2cYFxsOYLZouWaImZunxNmzyz5c=)
