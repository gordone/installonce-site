import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const requestData = await request.json();
    
    // Validate the request has required fields
    if (!requestData.zenbidApiKey) {
      return new Response(JSON.stringify({
        error: 'Missing required field: zenbidApiKey',
        code: 'MISSING_API_KEY'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // The HALO Method business profile
    const businessProfile = {
      businessId: 'halo_method',
      businessName: 'The HALO Method - Identity Coaching',
      description: 'Identity-first coaching that helps you decide who you are, prove it with one action, and live from the decision for seven days.',
      contact: {
        email: 'hello@thehalomethod.co',
        website: 'https://thehalomethod.co',
        phone: '+1-555-HALO'
      },
      address: {
        streetAddress: '123 Transformation Way',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'USA'
      },
      categories: ['coaching', 'productivity', 'wellness', 'transformation'],
      businessHours: {
        monday: { open: '09:00', close: '17:00' },
        tuesday: { open: '09:00', close: '17:00' },
        wednesday: { open: '10:00', close: '16:00' },
        thursday: { open: '09:00', close: '17:00' },
        friday: { open: '10:00', close: '16:00' },
        saturday: { open: '10:00', close: '14:00' },
        sunday: 'closed'
      },
      timezone: 'America/New_York',
      registeredAt: new Date().toISOString(),
      status: 'active',
      integrationEndpoints: {
        servicesUrl: 'https://thehalomethod.co/api/zenbid/services',
        bookingsUrl: 'https://thehalomethod.co/api/zenbid/bookings',
        availabilityUrl: 'https://thehalomethod.co/api/zenbid/availability',
        webhookUrl: 'https://thehalomethod.co/api/zenbid/webhook'
      }
    };

    // Register with ZenBid (simulated for now - in real implementation, would call ZenBid API)
    const zenbidRegistration = {
      success: true,
      businessId: businessProfile.businessId,
      zenbidBusinessId: 'zb_biz_' + Math.random().toString(36).substring(7),
      registrationDate: new Date().toISOString(),
      status: 'approved',
      message: 'Business successfully registered with ZenBid marketplace'
    };

    return new Response(JSON.stringify({
      success: true,
      data: {
        business: businessProfile,
        zenbidRegistration,
        nextSteps: [
          'Services automatically synced to ZenBid marketplace',
          'Pricing rules activated for dynamic pricing',
          'Business is now discoverable by AI agents',
          'Dashboard available at https://thehalomethod.co/business-dashboard'
        ]
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Business registration error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to register business',
      code: 'REGISTRATION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const GET: APIRoute = async () => {
  // Return current business registration status
  return new Response(JSON.stringify({
    businessId: 'halo_method',
    businessName: 'The HALO Method - Identity Coaching',
    status: 'active',
    registeredAt: '2026-04-28T20:59:00.000Z',
    zenbidBusinessId: 'zb_biz_halo_method',
    servicesCount: 3,
    activeRules: 4,
    integrationStatus: 'connected'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
