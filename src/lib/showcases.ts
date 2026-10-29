export interface Showcase {
  slug: string;
  title: string;
  blurb: string;
  intro: string[];
  booking?: string;
}

export const showcases: Showcase[] = [
  {
    slug: 'events',
    title: 'Events',
    blurb: 'Personal, start-to-finish coverage for tournaments, meetups, and community events.',
    intro: [
      'Events move fast and key moments only happen once. I work with event organizers to not just capture your event, but tell the story of the day and highlight the details you want remembered.',
      "I'm Total Escape Games' official photographer for their tournament and release events. Game stores mean harsh mixed lighting, crowded rooms, and long days, so I'm ready for whatever your event holds.",
      'Every event gets a fully edited gallery, with downloads sized for print, social media, and web.',
    ],
    booking: 'Booking tournaments, conventions, game-store events, and private events in the Denver area.',
  },
  {
    slug: 'sports',
    title: 'Sports',
    blurb: 'Riders, athletes, and action around the Front Range.',
    intro: [
      "Most of my sports work so far comes from the bike parks around Denver and Boulder, but I'm now taking on sessions and small events.",
      "Whether you're a rider or team wanting photos of your progression, or you're running a local race, club day, or league, I'd love to work together.",
      'You get an edited set of the best shots, with downloads sized for print, social media, and web.',
    ],
    booking: 'Booking rider and athlete sessions, local races, and club events around Denver.',
  },
  {
    slug: 'product',
    title: 'Detail & Product',
    blurb: 'Close-up work for products, artwork, and painted miniatures.',
    intro: [
      "Some of my favorite recent work has been the smallest: macro and detail shots of hand-painted miniatures at local tournaments, from brushwork and weathering to full armies.",
      "I'm now taking on product and detail work for artists and small brands, stores showcasing new arrivals, or wargamers showing off their favorite models.",
      'You get an edited high-detail photo set, with downloads sized for print, social media, and web.',
    ],
    booking: 'Booking miniature, product, and detail shoots around Denver.',
  },
  // {
  //   slug: 'folder-name',
  //   title: 'Title',
  //   blurb: 'One line for the home page.',
  //   intro: ['A paragraph or two for the top of the showcase page.'],
  // },
];

export const showcaseSlugs = new Set(showcases.map((c) => c.slug));
