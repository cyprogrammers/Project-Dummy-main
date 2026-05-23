import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

logger = logging.getLogger("EmailService")

# ─── Configuration ────────────────────────────────────────────────────────────
_FROM_EMAIL   = "marrisonbanda64@gmail.com"
_APP_PASSWORD = "ggzp lrus sdak fzcf"


# ─── Core transport ───────────────────────────────────────────────────────────

def sendEmail(
    to_email: str,
    subject: str,
    title: str,
    message_text: str,
    code: Optional[str] = None,
    expiry_minutes: Optional[int] = None,
    button_text: Optional[str] = None,
    button_link: Optional[str] = None,
) -> bool:
    """
    Send an HTML-formatted email.  Returns True on success, False on failure.
    Never raises — failures are logged so the caller can decide what to do.
    """
    code_section = ""
    if code:
        code_section = f"""
        <div style="
            background:#2563eb;color:white;text-align:center;
            padding:20px;font-size:32px;font-weight:bold;
            letter-spacing:5px;border-radius:10px;margin:25px 0;
        ">{code}</div>"""

    expiry_section = ""
    if expiry_minutes:
        expiry_section = (
            f"<p>This code expires in <strong>{expiry_minutes} minutes</strong>.</p>"
        )

    button_section = ""
    if button_text and button_link:
        button_section = f"""
        <div style="margin-top:30px;text-align:center;">
            <a href="{button_link}" style="
                background:#2563eb;color:white;padding:12px 24px;
                text-decoration:none;border-radius:8px;display:inline-block;
            ">{button_text}</a>
        </div>"""

    html = f"""
    <html>
    <body style="background-color:#f3f4f6;padding:40px;font-family:Arial,sans-serif;">
        <div style="max-width:600px;margin:auto;background:white;padding:30px;
                    border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color:#2563eb;">{title}</h2>
            <p>{message_text}</p>
            {code_section}
            {expiry_section}
            {button_section}
            <hr>
            <p style="font-size:12px;color:gray;">Automated notification — AITRMS Security Platform</p>
        </div>
    </body>
    </html>"""

    msg = MIMEMultipart("alternative")
    msg["From"]    = _FROM_EMAIL
    msg["To"]      = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(html, "html"))

    server = None
    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(_FROM_EMAIL, _APP_PASSWORD)
        server.sendmail(_FROM_EMAIL, to_email, msg.as_string())
        logger.info("Email sent → %s | Subject: %s", to_email, subject)
        return True
    except Exception as exc:
        logger.error("Email failed → %s | %s", to_email, exc)
        return False
    finally:
        if server:
            try:
                server.quit()
            except Exception:
                pass


# ─── High-level helpers ───────────────────────────────────────────────────────

def send_mfa_code(to_email: str, full_name: str, totp_code: str) -> bool:
    """
    Email a TOTP code to the user during the MFA login step.
    The code is valid for 30 seconds (one TOTP window); we show a 5-minute
    grace message so the user does not panic if delivery is slightly delayed.
    """
    return sendEmail(
        to_email=to_email,
        subject="AITRMS — Your Login Verification Code",
        title="Two-Factor Authentication Code",
        message_text=(
            f"Hello {full_name},<br><br>"
            "A sign-in attempt was detected for your AITRMS account. "
            "Use the code below to complete your login. "
            "<strong>Do not share this code with anyone.</strong>"
        ),
        code=totp_code,
        expiry_minutes=5,
    )


def send_welcome_email(
    to_email: str,
    full_name: str,
    role_name: str,
    temp_password: str,
    login_url: str = "http://localhost:5173",
) -> bool:
    """
    Send a welcome email to a newly created AITRMS user with their
    temporary credentials and a link to the login portal.
    """
    return sendEmail(
        to_email=to_email,
        subject="Welcome to AITRMS — Your Account is Ready",
        title=f"Welcome to AITRMS, {full_name}!",
        message_text=(
            f"Your <strong>{role_name}</strong> account has been created on the "
            "AITRMS Security Platform.<br><br>"
            f"<strong>Email:</strong> {to_email}<br>"
            f"<strong>Temporary Password:</strong> <code>{temp_password}</code><br><br>"
            "Please log in and change your password immediately."
        ),
        button_text="Log In to AITRMS",
        button_link=login_url,
    )
