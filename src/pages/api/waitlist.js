// Astro API endpoint for waitlist signup with Resend integration
export async function POST({ request }) {
  try {
    // Get the form data
    const data = await request.json();
    const { email } = data;
    
    // Validate email
    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Valid email address required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Resend API configuration
    const RESEND_API_KEY = import.meta.env.RESEND_API_KEY;
    const FROM_EMAIL = 'noreply@installonce.ai';
    const NOTIFICATION_EMAIL = 'gordon@yourdomain.com'; // Replace with your email

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY environment variable not set');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Server configuration error' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Prepare welcome email
    const welcomeEmailData = {
      from: FROM_EMAIL,
      to: [email],
      subject: 'Welcome to the Install Once Waitlist!',
      html: `
      <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #0a0a0a; color: #ffffff;">
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="font-size: 3rem; font-weight: 300; color: #00f0ff; margin-bottom: 10px; text-shadow: 0 0 20px rgba(0, 240, 255, 0.5);">Install Once</h1>
          <h2 style="font-size: 1.8rem; font-weight: 600; color: #ffffff; margin-bottom: 30px;">It Already Happened</h2>
        </div>
        
        <div style="background: linear-gradient(135deg, rgba(0, 240, 255, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%); padding: 30px; border-radius: 15px; border: 1px solid rgba(0, 240, 255, 0.2); margin-bottom: 30px;">
          <h3 style="color: #00f0ff; margin-bottom: 20px;">Welcome to the waitlist!</h3>
          <p style="line-height: 1.6; margin-bottom: 15px; color: #cccccc;">
            You're now among the first to know when <strong>Install Once</strong> launches. 
            This isn't just another self-help book—it's the operating system upgrade your life has been waiting for.
          </p>
          <p style="line-height: 1.6; color: #cccccc;">
            Most change fails because you keep trying to force new behavior from an old identity. You'll learn how to end that negotiation once and for all.
          </p>
        </div>
        
        <div style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 10px; border-left: 4px solid #00f0ff; margin-bottom: 30px;">
          <p style="margin: 0; color: #cccccc;">
            <strong style="color: #00f0ff;">What's Coming:</strong><br>
            • Early access to key chapters<br>
            • Launch date announcement<br>
            • Exclusive reader community<br>
            • Special launch pricing
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 40px; color: #888888; font-size: 0.9rem;">
          <p>Questions? Reply to this email—we read every message.</p>
          <p style="margin-top: 20px;">
            Best,<br>
            The Install Once Team
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1); color: #666666; font-size: 0.8rem;">
          <p>For readers of Atomic Habits, The Secret, and The 5 Second Rule.</p>
        </div>
      </div>
      `
    };

    // Prepare notification email
    const notificationEmailData = {
      from: FROM_EMAIL,
      to: [NOTIFICATION_EMAIL],
      subject: 'New Install Once Waitlist Signup',
      html: `
      <h3>New waitlist signup!</h3>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <p><strong>User Agent:</strong> ${request.headers.get('user-agent') || 'Unknown'}</p>
      `
    };

    // Send emails via Resend
    const sendEmail = async (emailData) => {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
      });
      
      return response.ok;
    };

    // Send both emails
    const [welcomeSent, notificationSent] = await Promise.all([
      sendEmail(welcomeEmailData),
      sendEmail(notificationEmailData)
    ]);

    if (welcomeSent) {
      // Log successful signup (optional - store in environment/database)
      console.log(`Waitlist signup: ${email} at ${new Date().toISOString()}`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Successfully joined the waitlist!' 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      throw new Error('Failed to send welcome email');
    }

  } catch (error) {
    console.error('Waitlist signup error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Failed to process signup. Please try again.' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle preflight OPTIONS request for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}