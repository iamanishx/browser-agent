# 🚀 ICICI Bank Automation Help Guide

This document contains step-by-step procedures, credentials handling, and troubleshooting tips for automating ICICI Bank corporate banking operations.

---

## 📋 Table of Contents

1. [ICICI Bank Login Procedure](#icici-bank-login-procedure)
2. [Payout Processing from CSV](#payout-processing-from-csv)
3. [Common Issues & Solutions](#common-issues--solutions)
4. [Credentials & Security](#credentials--security)
5. [CSV File Format Requirements](#csv-file-format-requirements)
6. [Useful Commands Reference](#useful-commands-reference)

---

## 🔐 ICICI Bank Login Procedure

### **Login URL:**
```
https://infinity.icicibank.com/corp/AuthenticationController?FORMSGROUP_ID__=AuthenticationFG&__START_TRAN_FLAG__=Y&FG_BUTTONS__=LOAD&ACTION.LOAD=Y&AuthenticationFG.LOGIN_FLAG=1&BANK_ID=ICI
```

### **Step-by-Step Login Process:**

#### **Step 1: Open Login Page**
```bash
agent-browser open "https://infinity.icicibank.com/corp/AuthenticationController?FORMSGROUP_ID__=AuthenticationFG&__START_TRAN_FLAG__=Y&FG_BUTTONS__=LOAD&ACTION.LOAD=Y&AuthenticationFG.LOGIN_FLAG=1&BANK_ID=ICI"
agent-browser wait --load networkidle
agent-browser snapshot -i
```

#### **Step 2: Fill Login Credentials**
```bash
# Find Login ID field (usually @e2 or similar)
agent-browser fill @e<login_ref> "<LOGIN_ID>"

# Find Password field (usually @e3 or similar)
agent-browser fill @e<password_ref> "<PASSWORD>"
```

**Example credentials format:**
- Login ID: `NEOFIRSTICICI`
- Password: `First@1998`

#### **Step 3: Handle CAPTCHA**
```bash
# Take screenshot to see CAPTCHA
agent-browser screenshot

# Read CAPTCHA manually from screenshot
# Enter CAPTCHA using keyboard (more reliable than fill)
keyboard type "<CAPTCHA_VALUE>"
```

**⚠️ Important:** CAPTCHA field often doesn't appear in snapshots. Use `keyboard type` after the password field.

#### **Step 4: Click PROCEED**
```bash
agent-browser click @e<proceed_button_ref>
sleep 3
agent-browser snapshot -i
```

#### **Step 5: Handle Location Permission Modal**
```bash
# If modal appears (button usually labeled "modal-redirection" or similar)
agent-browser click @e<modal_button_ref>
agent-browser wait --load networkidle
agent-browser snapshot -i
```

#### **Step 6: Enter OTP**
```bash
# Request OTP from human
request_human_input "Please enter the OTP sent to your registered mobile/email"

# Fill OTP in the textbox
agent-browser fill @e<otp_field_ref> "<OTP_VALUE>"

# Click CONFIRM button
agent-browser click @e<confirm_button_ref>
agent-browser wait --load networkidle
agent-browser snapshot -i
```

#### **Step 7: Verify Login Success**
```bash
# Check for user name on dashboard
# Should see: "Logged in as: SHASHWAT SHRIKHANDE" or similar
# Navigation menu should be visible with options like:
# - Accounts
# - Transfers & Bill Pay
# - Service Requests
# etc.
```

---

## 💸 Payout Processing from CSV

### **Expected CSV Format:**

```csv
Name,Account_Number,IFSC_Code,Amount,Remarks
John Doe,1234567890,ICIC0001234,5000,Salary Payment
Jane Smith,9876543210,ICIC0005678,3000,Consultant Fee
Ram Kumar,5555666677,SBIN0001234,10000,Vendor Payment
```

**Required Columns:**
- `Name` - Beneficiary name
- `Account_Number` - Bank account number
- `IFSC_Code` - Bank IFSC code
- `Amount` - Transfer amount (numeric)
- `Remarks` - Optional reference/description

### **Payout Process Steps:**

#### **Step 1: Read CSV File**
```bash
# Check if file exists
ls -la <csv_filename>

# Preview first few rows
head -n 5 <csv_filename>

# Count total rows (excluding header)
wc -l <csv_filename>
```

#### **Step 2: Navigate to Transfer Section**
```bash
# After successful login, find "Transfers & Bill Pay" menu
agent-browser snapshot -i
agent-browser click @e<transfers_menu_ref>
agent-browser wait --load networkidle
agent-browser snapshot -i

# Look for options like:
# - Fund Transfer
# - NEFT/RTGS
# - Bulk Upload
# - Add Beneficiary
```

#### **Step 3: Process Each Payout**

**Option A: Single Payment Entry**
```bash
# For each row in CSV:
# 1. Click "New Payment" or "Fund Transfer"
# 2. Select payment type (NEFT/RTGS/IMPS)
# 3. Fill beneficiary details
# 4. Enter amount
# 5. Add remarks
# 6. Verify and confirm
# 7. Handle OTP if required
# 8. Capture transaction ID
```

**Option B: Bulk Upload**
```bash
# If bank supports bulk upload:
# 1. Navigate to Bulk Upload section
# 2. Download template (if required)
# 3. Upload CSV file
# 4. Verify uploaded data
# 5. Authorize transaction
# 6. Handle OTP if required
```

#### **Step 4: Track Results**
```bash
# Create a results log
echo "Transaction_ID,Beneficiary,Amount,Status,Timestamp" > payout_results.csv

# For each transaction, append result:
echo "$TXNID,$NAME,$AMOUNT,Success,$(date)" >> payout_results.csv
# OR
echo "N/A,$NAME,$AMOUNT,Failed: $ERROR,$(date)" >> payout_results.csv
```

---

## 🛠️ Common Issues & Solutions

### **Issue 1: CAPTCHA Field Not in Snapshot**
**Symptom:** Can't find CAPTCHA input field using snapshot -i  
**Solution:** Use `keyboard type` after filling password field. CAPTCHA field accepts keyboard input even if not visible in snapshot.

```bash
agent-browser fill @e<password_ref> "<PASSWORD>"
keyboard type "<CAPTCHA_VALUE>"
```

---

### **Issue 2: Location Permission Modal Blocks Progress**
**Symptom:** OTP page doesn't load, stuck on blank/modal screen  
**Solution:** Look for modal button in snapshot and click it.

```bash
agent-browser snapshot -i
# Look for button with text like "Allow", "OK", or ref like "modal-redirection"
agent-browser click @e<modal_button_ref>
```

---

### **Issue 3: "Resend OTP" Link Logs Out Session**
**Symptom:** Clicking resend OTP link returns to login page  
**Solution:** Avoid clicking random links. If OTP expires, restart login from beginning.

---

### **Issue 4: Page Doesn't Navigate After Click**
**Symptom:** Clicked PROCEED but still on same page  
**Solution:** 
- Take screenshot to check for error messages
- Verify CAPTCHA was entered correctly
- Wait longer (use `sleep 5`)
- Check if there's a validation error shown

```bash
agent-browser screenshot
agent-browser snapshot -i
# Look for error messages in red text
```

---

### **Issue 5: Element References Changed**
**Symptom:** "Element not found" or "Invalid ref" error  
**Solution:** Always take fresh snapshot after page navigation.

```bash
# After any click/navigation:
agent-browser wait --load networkidle
agent-browser snapshot -i
# Use NEW refs from new snapshot
```

---

### **Issue 6: OTP Timeout**
**Symptom:** OTP expires before entry  
**Solution:** Set longer timeout in request_human_input (default 5 minutes).

```bash
request_human_input --timeout 600000 "Enter OTP (10 min limit)"
```

---

## 🔒 Credentials & Security

### **Storage Best Practices:**

1. **Never hardcode credentials in scripts**
2. **Use environment variables:**
```bash
export ICICI_LOGIN_ID="NEOFIRSTICICI"
export ICICI_PASSWORD="First@1998"
```

3. **Use session management:**
```bash
# Save logged-in state
agent-browser state save icici-session.json

# Reuse later
agent-browser state load icici-session.json
agent-browser open "https://infinity.icicibank.com/corp/..."
```

4. **Use encrypted session storage:**
```bash
export AGENT_BROWSER_ENCRYPTION_KEY=$(openssl rand -hex 32)
agent-browser --session-name icici-secure open <URL>
```

### **Current Known Credentials:**
- **Login ID:** `NEOFIRSTICICI`
- **Password:** `First@1998`
- **User Name:** `SHASHWAT SHRIKHANDE`

---

## 📊 CSV File Format Requirements

### **Minimum Required Format:**
```csv
Name,Account_Number,IFSC_Code,Amount,Remarks
```

### **Extended Format (Optional Fields):**
```csv
Serial_No,Name,Account_Number,IFSC_Code,Amount,Remarks,Email,Mobile,Date
1,John Doe,1234567890,ICIC0001234,5000,Salary,john@example.com,9876543210,2024-01-15
```

### **Field Validations:**
- `Account_Number`: 9-18 digits
- `IFSC_Code`: 11 characters (e.g., ICIC0001234)
- `Amount`: Numeric, positive value
- `Name`: Max 40 characters (bank limit)
- `Remarks`: Max 30 characters (bank limit)

### **CSV Reading in Bash:**
```bash
# Skip header and read CSV
tail -n +2 payouts.csv | while IFS=',' read -r name account ifsc amount remarks; do
    echo "Processing: $name - $amount"
    # Process payout here
done
```

---

## 🎯 Useful Commands Reference

### **Browser Navigation:**
```bash
# Open page
agent-browser open "<URL>"

# Wait for load
agent-browser wait --load networkidle

# Take snapshot
agent-browser snapshot -i

# Take screenshot
agent-browser screenshot

# Get current URL
agent-browser get url
```

### **Element Interaction:**
```bash
# Click element
agent-browser click @e<ref>

# Fill input
agent-browser fill @e<ref> "value"

# Type without clearing
agent-browser type @e<ref> "value"

# Keyboard input
keyboard type "text"

# Press key
agent-browser press Enter
```

### **State Management:**
```bash
# Save session
agent-browser state save session.json

# Load session
agent-browser state load session.json

# List sessions
agent-browser session list

# Close browser
agent-browser close
```

### **File Operations:**
```bash
# Check file exists
test -f file.csv && echo "exists" || echo "not found"

# Count lines
wc -l file.csv

# Preview file
head -n 10 file.csv

# Read CSV in loop
while IFS=',' read -r col1 col2 col3; do
    echo "$col1 - $col2"
done < file.csv
```

---

## 🚨 Emergency Procedures

### **If Session Gets Stuck:**
```bash
agent-browser close
# Wait 5 seconds
sleep 5
# Restart from login
```

### **If CAPTCHA Keeps Failing:**
- Take multiple screenshots
- Verify CAPTCHA reading carefully (common mistakes: 0 vs O, 1 vs l, 5 vs S)
- Try refreshing page if CAPTCHA is unclear

### **If Payment Fails:**
1. Capture screenshot of error
2. Note down beneficiary details
3. Save transaction reference (if any)
4. Log error to results file
5. Continue with next payment
6. Retry failed ones at end

---

## 📝 Workflow Templates

### **Template 1: Complete Login + Single Payout**
```bash
#!/bin/bash

# Login
agent-browser open "<ICICI_URL>"
agent-browser wait --load networkidle
agent-browser snapshot -i

agent-browser fill @e2 "$ICICI_LOGIN_ID"
agent-browser fill @e3 "$ICICI_PASSWORD"
agent-browser screenshot
# Read CAPTCHA manually
keyboard type "$CAPTCHA"
agent-browser click @e4  # PROCEED
sleep 3
agent-browser snapshot -i
agent-browser click @e1  # Modal if present
agent-browser snapshot -i

# OTP
OTP=$(request_human_input "Enter OTP")
agent-browser fill @e16 "$OTP"
agent-browser click @e18  # CONFIRM
agent-browser wait --load networkidle
agent-browser snapshot -i

# Navigate to transfers
# ... payout logic here ...
```

### **Template 2: Bulk CSV Processing**
```bash
#!/bin/bash

# Assuming already logged in
echo "Processing payouts from $1"

# Read CSV (skip header)
tail -n +2 "$1" | while IFS=',' read -r name account ifsc amount remarks; do
    echo "Processing: $name - Rs.$amount"
    
    # Navigate to payment page
    # Fill details
    # Submit
    # Capture result
    
    echo "$name,$account,$amount,Processed,$(date)" >> results.log
done

echo "Batch processing complete!"
```

---

## 🎓 Lessons Learned

1. **Always snapshot after navigation** - Element refs change
2. **Screenshots reveal CAPTCHA and errors** - Use liberally
3. **Keyboard input works when fill doesn't** - Especially for CAPTCHA
4. **Modals can block silently** - Always check for popups/overlays
5. **Wait for networkidle** - Banking pages are slow
6. **OTP must come from human** - Never hardcode or guess
7. **Save state for reuse** - Avoid re-login if possible
8. **Log everything** - Transaction IDs, errors, timestamps

---

## 📞 Support & Resources

- **Agent Browser Docs:** `references/` folder
- **Command Reference:** `references/commands.md`
- **Session Management:** `references/session-management.md`
- **Authentication:** `references/authentication.md`

---

## ✅ Pre-flight Checklist

Before running payout automation:

- [ ] CSV file prepared and validated
- [ ] ICICI credentials available (env vars set)
- [ ] Browser agent working (`agent-browser --version`)
- [ ] Test login manually first
- [ ] Results log file location decided
- [ ] Backup/rollback plan ready
- [ ] Human available for OTP entry
- [ ] Internet connection stable
- [ ] Bank portal accessible

---

**Last Updated:** 2024  
**Maintained For:** ICICI Bank Corporate Banking Automation  
**Created By:** Browser Automation Agent

