"""Email service (SMTP).

Sends RFI emails and other transactional emails via SMTP (Gmail/Google Workspace).
"""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings

logger = logging.getLogger(__name__)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587


def send_rfi_email(
    *,
    from_name: str,
    from_email: str,
    reply_to: str,
    to: str,
    to_name: str | None = None,
    cc: str | None = None,
    rfi_number: str,
    subject: str,
    question: str,
    project_name: str,
) -> bool:
    """Send an RFI email to the GC contact.

    Returns True on success, False on failure.
    """
    settings = get_settings()
    if not settings.smtp_user or not settings.smtp_pass:
        logger.warning("SMTP credentials not configured — skipping email send")
        return False

    email_subject = f"RFI {rfi_number}: {subject}"

    # Build HTML body
    html = f"""\
<html>
<body style="font-family: 'DM Sans', Arial, sans-serif; color: #1C1917; line-height: 1.6;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h2 style="color: #C67F17; margin-bottom: 4px;">RFI {rfi_number}</h2>
    <p style="color: #57534E; margin-top: 0;">Project: {project_name}</p>
    <p style="font-weight: 600;">{subject}</p>
    <div style="background: #FAFAF8; border: 1px solid #E8E5DE; border-radius: 8px; padding: 16px; margin: 16px 0; white-space: pre-wrap;">
{question}
    </div>
    <p style="color: #57534E; font-size: 14px;">Sent by {from_name}</p>
    <p style="color: #57534E; font-size: 14px;">Please reply directly to this email to respond.</p>
    <hr style="border: none; border-top: 1px solid #E8E5DE; margin: 24px 0;" />
    <p style="color: #9CA3AF; font-size: 12px;">Sent via efilo.ai</p>
  </div>
</body>
</html>"""

    # Plain text fallback
    text = (
        f"RFI {rfi_number}\n"
        f"Project: {project_name}\n\n"
        f"{subject}\n\n"
        f"{question}\n\n"
        f"Sent by {from_name}\n"
        f"Please reply directly to this email to respond.\n"
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = email_subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = f"{to_name} <{to}>" if to_name else to
    msg["Reply-To"] = reply_to
    if cc:
        msg["Cc"] = cc

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    recipients = [to]
    if cc:
        recipients.append(cc)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.smtp_user, settings.smtp_pass)
            server.sendmail(from_email, recipients, msg.as_string())
        logger.info("RFI email sent: %s → %s", rfi_number, to)
        return True
    except Exception:
        logger.exception("Failed to send RFI email %s to %s", rfi_number, to)
        return False
