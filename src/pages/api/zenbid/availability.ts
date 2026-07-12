import type { APIRoute } from 'astro';

interface AvailabilityQuery {
  serviceId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  duration?: number;
  timeRange?: {
    start: string;
    end: string;
  };
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
  price: number;
  appliedRules: string[];
  bookingUrl?: string;
}

interface DailyAvailability {
  date: string;
  dayOfWeek: string;
  slots: TimeSlot[];
  totalAvailable: number;
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const searchParams = new URLSearchParams(url.search);
    
    const query: AvailabilityQuery = {
      serviceId: searchParams.get('serviceId') || undefined,
      date: searchParams.get('date') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      duration: searchParams.get('duration') ? parseInt(searchParams.get('duration')!) : undefined,
      timeRange: searchParams.get('timeStart') && searchParams.get('timeEnd') ? {
        start: searchParams.get('timeStart')!,
        end: searchParams.get('timeEnd')!
      } : undefined
    };

    // Service definitions with base pricing
    const services = {
      'identity_installation': { name: 'Identity Installation Session', basePrice: 150, duration: 90 },
      'habit_diagnostic': { name: 'Habit Diagnostic Consultation', basePrice: 75, duration: 45 },
      'deep_settings': { name: 'Deep Settings Reconfiguration', basePrice: 200, duration: 120 }
    };

    // Business hours schedule
    const businessHours = {
      monday: { open: '09:00', close: '17:00' },
      tuesday: { open: '09:00', close: '17:00' },
      wednesday: { open: '10:00', close: '16:00' },
      thursday: { open: '09:00', close: '17:00' },
      friday: { open: '10:00', close: '16:00' },
      saturday: { open: '10:00', close: '14:00' },
      sunday: null // Closed
    };

    // Determine date range
    let startDate = new Date();
    let endDate = new Date();
    
    if (query.date) {
      startDate = new Date(query.date);
      endDate = new Date(query.date);
    } else if (query.startDate && query.endDate) {
      startDate = new Date(query.startDate);
      endDate = new Date(query.endDate);
    } else {
      // Default: next 7 days
      endDate.setDate(endDate.getDate() + 7);
    }

    const availability: DailyAvailability[] = [];

    // Generate availability for each day
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const currentDate = new Date(d);
      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as keyof typeof businessHours;
      const dayHours = businessHours[dayName];

      if (!dayHours) {
        // Business closed
        availability.push({
          date: currentDate.toISOString().split('T')[0],
          dayOfWeek: currentDate.toLocaleDateString('en-US', { weekday: 'long' }),
          slots: [],
          totalAvailable: 0
        });
        continue;
      }

      // Generate time slots
      const slots = generateTimeSlots(currentDate, dayHours, query, services);
      
      availability.push({
        date: currentDate.toISOString().split('T')[0],
        dayOfWeek: currentDate.toLocaleDateString('en-US', { weekday: 'long' }),
        slots: slots.filter(slot => {
          // Apply time range filter if specified
          if (query.timeRange) {
            const slotStart = slot.startTime.split('T')[1];
            return slotStart >= query.timeRange.start && slotStart <= query.timeRange.end;
          }
          return true;
        }),
        totalAvailable: slots.filter(s => s.available).length
      });
    }

    // Apply service-specific filtering
    let filteredAvailability = availability;
    
    if (query.serviceId && services[query.serviceId as keyof typeof services]) {
      const service = services[query.serviceId as keyof typeof services];
      // Filter slots that can accommodate the service duration
      filteredAvailability = availability.map(day => ({
        ...day,
        slots: day.slots.filter(slot => {
          const slotDuration = calculateSlotDuration(slot.startTime, slot.endTime);
          return slotDuration >= service.duration;
        })
      }));
    }

    // Generate recommendations
    const recommendations = generateRecommendations(filteredAvailability, query);

    return new Response(JSON.stringify({
      success: true,
      query: {
        ...query,
        appliedAt: new Date().toISOString(),
        dateRange: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0]
        }
      },
      availability: filteredAvailability,
      summary: {
        totalDays: filteredAvailability.length,
        availableDays: filteredAvailability.filter(day => day.totalAvailable > 0).length,
        totalSlots: filteredAvailability.reduce((sum, day) => sum + day.totalAvailable, 0),
        averageDailySlots: filteredAvailability.length > 0 
          ? Math.round(filteredAvailability.reduce((sum, day) => sum + day.totalAvailable, 0) / filteredAvailability.length)
          : 0
      },
      recommendations,
      metadata: {
        businessName: 'Install Once - Life Transformation Coaching',
        timezone: 'America/New_York',
        currency: 'USD',
        bookingAdvanceRequired: '24 hours',
        cancellationPolicy: '24 hours notice required',
        dynamicPricingActive: true
      }
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });

  } catch (error) {
    console.error('Availability API error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to retrieve availability',
      code: 'AVAILABILITY_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

function generateTimeSlots(
  date: Date, 
  hours: { open: string; close: string }, 
  query: AvailabilityQuery,
  services: any
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  
  // Parse business hours
  const [openHour, openMinute] = hours.open.split(':').map(Number);
  const [closeHour, closeMinute] = hours.close.split(':').map(Number);
  
  const slotInterval = 30; // 30-minute intervals
  const serviceDuration = query.serviceId && services[query.serviceId] 
    ? services[query.serviceId].duration 
    : 60; // Default 1 hour
  
  // Generate slots throughout the day
  for (let hour = openHour; hour < closeHour; hour++) {
    for (let minute = 0; minute < 60; minute += slotInterval) {
      // Check if we have enough time for a service before closing
      const slotStart = new Date(date);
      slotStart.setHours(hour, minute, 0, 0);
      
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + serviceDuration);
      
      const businessClose = new Date(date);
      businessClose.setHours(closeHour, closeMinute, 0, 0);
      
      if (slotEnd > businessClose) {
        break; // Not enough time before closing
      }
      
      // Skip past times
      if (slotStart <= new Date()) {
        continue;
      }
      
      // Calculate dynamic pricing for this slot
      const pricing = calculateSlotPricing(slotStart, query, services);
      
      // Simulate availability (85% chance available)
      const available = Math.random() > 0.15;
      
      slots.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        available,
        price: pricing.price,
        appliedRules: pricing.appliedRules,
        bookingUrl: available ? 'https://installonce.ai/api/zenbid/bookings' : undefined
      });
    }
  }
  
  return slots;
}

function calculateSlotPricing(startTime: Date, query: AvailabilityQuery, services: any) {
  const serviceId = query.serviceId || 'habit_diagnostic';
  const basePrice = services[serviceId]?.basePrice || 75;
  
  let price = basePrice;
  const appliedRules: string[] = [];
  
  // Apply dynamic pricing rules
  const dayOfWeek = startTime.getDay();
  const hour = startTime.getHours();
  
  // Monday/Tuesday discount
  if (dayOfWeek === 1 || dayOfWeek === 2) {
    price *= 0.8;
    appliedRules.push('Weekday Special: 20% off');
  }
  
  // Early morning discount (8-10am)
  if (hour >= 8 && hour < 10) {
    price *= 0.85;
    appliedRules.push('Early Bird: 15% off');
  }
  
  // Same day booking discount
  const today = new Date();
  if (startTime.toDateString() === today.toDateString()) {
    price *= 0.75;
    appliedRules.push('Same-Day: 25% off');
  }
  
  // Weekend premium
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    price *= 1.2;
    appliedRules.push('Weekend Premium: +20%');
  }
  
  return {
    price: Math.round(price),
    appliedRules
  };
}

function calculateSlotDuration(startTime: string, endTime: string): number {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return (end.getTime() - start.getTime()) / (1000 * 60); // Duration in minutes
}

function generateRecommendations(availability: DailyAvailability[], query: AvailabilityQuery) {
  const recommendations = [];
  
  // Find best value slots (highest discount)
  const discountSlots = availability.flatMap(day => 
    day.slots
      .filter(slot => slot.available && slot.appliedRules.some(rule => rule.includes('off')))
      .map(slot => ({ ...slot, date: day.date, dayOfWeek: day.dayOfWeek }))
  ).sort((a, b) => {
    const aDiscount = a.appliedRules.filter(rule => rule.includes('off')).length;
    const bDiscount = b.appliedRules.filter(rule => rule.includes('off')).length;
    return bDiscount - aDiscount;
  }).slice(0, 3);
  
  if (discountSlots.length > 0) {
    recommendations.push({
      type: 'best_value',
      title: 'Best Value Sessions',
      description: 'Maximum savings with our dynamic pricing',
      slots: discountSlots
    });
  }
  
  // Find earliest available
  const nextAvailable = availability
    .find(day => day.totalAvailable > 0)
    ?.slots.find(slot => slot.available);
  
  if (nextAvailable) {
    recommendations.push({
      type: 'next_available',
      title: 'Next Available',
      description: 'Earliest slot to start your transformation',
      slots: [nextAvailable]
    });
  }
  
  // Find optimal times (Tuesday mornings with discounts)
  const optimalSlots = availability.flatMap(day => 
    day.dayOfWeek === 'Tuesday' ? 
    day.slots
      .filter(slot => slot.available && 
        new Date(slot.startTime).getHours() >= 9 && 
        new Date(slot.startTime).getHours() < 11)
      .map(slot => ({ ...slot, date: day.date, dayOfWeek: day.dayOfWeek })) : []
  );
  
  if (optimalSlots.length > 0) {
    recommendations.push({
      type: 'optimal_time',
      title: 'Optimal Times',
      description: 'Tuesday mornings - best pricing and coach energy',
      slots: optimalSlots.slice(0, 2)
    });
  }
  
  return recommendations;
}
