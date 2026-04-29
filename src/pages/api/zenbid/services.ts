import type { APIRoute } from 'astro';

interface SearchFilters {
  category?: string;
  maxPrice?: number;
  minPrice?: number;
  duration?: number;
  date?: string;
  timeSlot?: string;
  location?: string;
}

interface DynamicPricingContext {
  requestDate: Date;
  timeSlot?: string;
  bookingAdvance?: number; // hours in advance
  isWeekend: boolean;
  isEarlyMorning: boolean;
  isSameDay: boolean;
}

function calculateDynamicPrice(basePrice: number, context: DynamicPricingContext): { 
  finalPrice: number; 
  appliedRules: string[]; 
  savings?: number; 
} {
  let finalPrice = basePrice;
  const appliedRules: string[] = [];

  // Monday/Tuesday Discount (20% off)
  const dayOfWeek = context.requestDate.getDay();
  if (dayOfWeek === 1 || dayOfWeek === 2) { // Monday = 1, Tuesday = 2
    finalPrice *= 0.8;
    appliedRules.push('Weekday Special: 20% off Monday & Tuesday');
  }

  // Early Morning Discount (15% off for 8-10am)
  if (context.isEarlyMorning && context.timeSlot && 
      (context.timeSlot.startsWith('08:') || context.timeSlot.startsWith('09:'))) {
    finalPrice *= 0.85;
    appliedRules.push('Early Bird Special: 15% off 8-10am slots');
  }

  // Same-Day Booking Discount (25% off)
  if (context.isSameDay) {
    finalPrice *= 0.75;
    appliedRules.push('Same-Day Special: 25% off last-minute bookings');
  }

  // Weekend Premium (20% markup)
  if (context.isWeekend && !context.isSameDay) { // Don't double-apply with same-day
    finalPrice *= 1.2;
    appliedRules.push('Weekend Premium: +20% for high-demand times');
  }

  const savings = basePrice > finalPrice ? basePrice - finalPrice : undefined;
  
  return {
    finalPrice: Math.round(finalPrice),
    appliedRules,
    savings
  };
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const searchParams = new URLSearchParams(url.search);
    
    const filters: SearchFilters = {
      category: searchParams.get('category') || undefined,
      maxPrice: searchParams.get('maxPrice') ? parseInt(searchParams.get('maxPrice')!) : undefined,
      minPrice: searchParams.get('minPrice') ? parseInt(searchParams.get('minPrice')!) : undefined,
      duration: searchParams.get('duration') ? parseInt(searchParams.get('duration')!) : undefined,
      date: searchParams.get('date') || undefined,
      timeSlot: searchParams.get('timeSlot') || undefined,
      location: searchParams.get('location') || undefined,
    };

    // Base services
    const baseServices = [
      {
        id: 'identity_installation',
        name: 'Identity Installation Session',
        description: 'One-on-one session to install a new identity and end behavior negotiations. Transform how you see yourself at the deepest level.',
        longDescription: 'Stop negotiating with yourself. This intensive 90-minute session rewires your self-concept at the identity level. We identify limiting beliefs, install empowering new identities, and create the mental architecture for lasting change. You\'ll leave knowing exactly who you are and what you\'re capable of.',
        duration: 90,
        basePrice: 150,
        category: 'transformation',
        provider: 'Install Once - Life Transformation Coaching',
        location: 'New York, NY (Virtual available)',
        rating: 4.9,
        reviewCount: 127,
        tags: ['identity', 'transformation', 'mindset', 'breakthrough'],
        deliveryFormat: 'video_call',
        prerequisites: 'None - suitable for all levels',
        outcomes: [
          'Clear, empowering identity that drives action',
          'End internal negotiation and self-doubt',
          'Behavioral consistency that matches your goals',
          'Deep confidence in your capabilities'
        ]
      },
      {
        id: 'habit_diagnostic',
        name: 'Habit Diagnostic Consultation',
        description: 'Analyze your current habit loops and design your personalized installation strategy. Discover what has been running your life on autopilot.',
        longDescription: 'Before you can change, you need to understand what\'s really running the show. This diagnostic session maps your current habit loops, identifies the cues and rewards driving unwanted behaviors, and designs a custom installation strategy for new patterns.',
        duration: 45,
        basePrice: 75,
        category: 'diagnostic',
        provider: 'Install Once - Life Transformation Coaching',
        location: 'New York, NY (Virtual available)',
        rating: 4.8,
        reviewCount: 89,
        tags: ['habits', 'analysis', 'strategy', 'behavioral-design'],
        deliveryFormat: 'video_call',
        prerequisites: 'None - perfect starting point',
        outcomes: [
          'Complete map of your current habit loops',
          'Identification of trigger patterns',
          'Custom installation strategy design',
          'Clear next steps for transformation'
        ]
      },
      {
        id: 'deep_settings',
        name: 'Deep Settings Reconfiguration',
        description: 'Intensive 2-hour session to rewire the deep settings that control your automatic behaviors. For serious transformation seekers.',
        longDescription: 'Your life is controlled by deep settings - unconscious programs that determine your automatic responses. This intensive session accesses and rewrites these core programs. We identify limiting patterns, install new defaults, and upgrade your mental operating system for peak performance.',
        duration: 120,
        basePrice: 200,
        category: 'intensive',
        provider: 'Install Once - Life Transformation Coaching',
        location: 'New York, NY (Virtual available)',
        rating: 5.0,
        reviewCount: 42,
        tags: ['deep-work', 'intensive', 'reprogramming', 'breakthrough'],
        deliveryFormat: 'video_call',
        prerequisites: 'Recommended: Habit Diagnostic first',
        outcomes: [
          'Rewired automatic behavioral patterns',
          'New default responses to triggers',
          'Upgraded mental operating system',
          'Effortless execution of desired behaviors'
        ]
      }
    ];

    // Calculate dynamic pricing for each service
    const requestDate = filters.date ? new Date(filters.date) : new Date();
    const dayOfWeek = requestDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
    const isEarlyMorning = filters.timeSlot ? 
      (filters.timeSlot.startsWith('08:') || filters.timeSlot.startsWith('09:')) : false;
    const isSameDay = filters.date ? 
      new Date(filters.date).toDateString() === new Date().toDateString() : false;

    const pricingContext: DynamicPricingContext = {
      requestDate,
      timeSlot: filters.timeSlot,
      isWeekend,
      isEarlyMorning,
      isSameDay
    };

    const servicesWithPricing = baseServices.map(service => {
      const pricing = calculateDynamicPrice(service.basePrice, pricingContext);
      
      return {
        ...service,
        pricing: {
          basePrice: service.basePrice,
          currentPrice: pricing.finalPrice,
          currency: 'USD',
          appliedRules: pricing.appliedRules,
          savings: pricing.savings,
          dynamicPricing: true
        },
        availability: {
          nextAvailable: getNextAvailableSlot(service.id, filters.date, filters.timeSlot),
          totalSlots: getAvailableSlots(service.id, filters.date),
          bookingWindow: '24 hours',
          cancellationPolicy: '24 hours notice required'
        },
        booking: {
          url: `https://installonce.ai/api/zenbid/bookings`,
          method: 'POST',
          requiresAuth: false,
          estimatedResponseTime: '< 30 seconds'
        }
      };
    });

    // Apply filters
    let filteredServices = servicesWithPricing;

    if (filters.category) {
      filteredServices = filteredServices.filter(s => 
        s.category.toLowerCase().includes(filters.category!.toLowerCase()) ||
        s.tags.some(tag => tag.toLowerCase().includes(filters.category!.toLowerCase()))
      );
    }

    if (filters.maxPrice) {
      filteredServices = filteredServices.filter(s => s.pricing.currentPrice <= filters.maxPrice!);
    }

    if (filters.minPrice) {
      filteredServices = filteredServices.filter(s => s.pricing.currentPrice >= filters.minPrice!);
    }

    if (filters.duration) {
      filteredServices = filteredServices.filter(s => 
        Math.abs(s.duration - filters.duration!) <= 15 // Within 15 minutes
      );
    }

    return new Response(JSON.stringify({
      success: true,
      query: {
        filters,
        appliedAt: new Date().toISOString(),
        resultsCount: filteredServices.length
      },
      services: filteredServices,
      metadata: {
        provider: 'Install Once - Life Transformation Coaching',
        businessId: 'installonce_ai',
        location: 'New York, NY',
        timezone: 'America/New_York',
        dynamicPricingActive: true,
        averageSavings: filteredServices.reduce((acc, s) => acc + (s.pricing.savings || 0), 0) / filteredServices.length,
        bookingOptions: ['instant', 'negotiable', 'scheduled']
      }
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });

  } catch (error) {
    console.error('Services API error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to retrieve services',
      code: 'SERVICES_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Helper functions for availability (simplified for demo)
function getNextAvailableSlot(serviceId: string, date?: string, preferredTime?: string): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (preferredTime && preferredTime.startsWith('08:')) {
    return `${tomorrow.toISOString().split('T')[0]}T08:00:00Z`;
  }
  
  return `${tomorrow.toISOString().split('T')[0]}T14:00:00Z`;
}

function getAvailableSlots(serviceId: string, date?: string): number {
  // Simulate different availability based on service popularity
  const availability = {
    'identity_installation': 3, // Higher demand
    'habit_diagnostic': 6, // Most popular
    'deep_settings': 2 // Most intensive, fewer slots
  };
  
  return availability[serviceId as keyof typeof availability] || 1;
}

export const POST = GET; // Allow POST for more complex queries