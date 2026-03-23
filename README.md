# NEU Library Visitor Log

The **NEU Library Visitor Log** is a kiosk-based web application developed to modernize the library’s visitor registration process. Instead of using manual logbooks, students, employees, and guests sign in using their institutional Google accounts, provide visit details, and are automatically recorded in a real-time database.

The system is designed for shared kiosk environments, allowing fast visitor entry while giving administrators access to monitoring tools, analytics, and user management features through a dedicated dashboard.

 **Live Site:**  
https://ais-pre-neoqn7ztbhiwrbzttfn65f-350130303039.asia-southeast1.run.app

---

## Features

-  Secure Google Sign-In using institutional accounts
-  Automated visitor registration with predefined Department and Program fields
-  Visit purpose selection (Reading, Research, Computer Use, Meeting)
-  Auto-filled user information from Google authentication
-  Kiosk workflow with automatic logout after submission
-  Blocked user detection and access restriction
-  Admin dashboard with real-time statistics:
  - Today
  - This Week
  - This Month
-  Live visitor log with search and multi-filter options
-  User management (block users)
-  Export filtered visitor records to PDF
-  Responsive dashboard-style interface

---

##  My Role & Contributions

This project was designed and developed as a **full-stack Firebase web application**. My responsibilities included:

- Designing the kiosk-based user flow and application architecture
- Implementing Google Authentication using Firebase Auth
- Developing Role-Based Access Control (Visitor and Admin modes)
- Creating the visitor entry interface with automated data handling
- Building a real-time admin dashboard using Firestore listeners
- Implementing search, filtering, and statistics computation
- Developing the auto logout mechanism for kiosk operation
- Integrating PDF export functionality using jsPDF
- Designing a responsive enterprise-style user interface
