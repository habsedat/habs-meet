import React from 'react';
import Header from '../components/Header';

const BrandPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-midnight">
      <Header title="Brand Kit" />
      
      <main className="container mx-auto px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-cloud mb-4 font-brand">
              Habs Meet Brand Kit
            </h1>
            <p className="text-xl text-gray-300">
              Design system and component library for Habs Meet
            </p>
          </div>

          {/* Color Palette */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-cloud mb-6">Color Palette</h2>
            <div className="grid md:grid-cols-5 gap-6">
              <div className="text-center">
                <div className="w-24 h-24 bg-techBlue rounded-lg mx-auto mb-3"></div>
                <h3 className="font-medium text-cloud mb-1">Tech Blue</h3>
                <p className="text-sm text-gray-400">#0E3A8A</p>
              </div>
              <div className="text-center">
                <div className="w-24 h-24 bg-violetDeep rounded-lg mx-auto mb-3"></div>
                <h3 className="font-medium text-cloud mb-1">Violet Deep</h3>
                <p className="text-sm text-gray-400">#6C63FF</p>
              </div>
              <div className="text-center">
                <div className="w-24 h-24 bg-goldBright rounded-lg mx-auto mb-3"></div>
                <h3 className="font-medium text-cloud mb-1">Gold Bright</h3>
                <p className="text-sm text-gray-400">#FFD35C</p>
              </div>
              <div className="text-center">
                <div className="w-24 h-24 bg-midnight rounded-lg mx-auto mb-3 border border-gray-600"></div>
                <h3 className="font-medium text-cloud mb-1">Midnight</h3>
                <p className="text-sm text-gray-400">#0E0E10</p>
              </div>
              <div className="text-center">
                <div className="w-24 h-24 bg-cloud rounded-lg mx-auto mb-3 border border-gray-300"></div>
                <h3 className="font-medium text-midnight mb-1">Cloud</h3>
                <p className="text-sm text-gray-600">#F5F5F5</p>
              </div>
            </div>
          </section>

          {/* Typography */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-cloud mb-6">Typography</h2>
            <div className="card p-6">
              <div className="space-y-4">
                <div>
                  <h1 className="text-4xl font-bold text-midnight font-brand mb-2">
                    Habs Futurist Font
                  </h1>
                  <p className="text-sm text-gray-600">Font Family: Habs Futurist, Inter, system-ui, sans-serif</p>
                </div>
                <div>
                  <h2 className="text-3xl font-semibold text-midnight font-brand mb-2">
                    Heading 2
                  </h2>
                  <p className="text-sm text-gray-600">Semibold weight</p>
                </div>
                <div>
                  <h3 className="text-2xl font-medium text-midnight font-brand mb-2">
                    Heading 3
                  </h3>
                  <p className="text-sm text-gray-600">Medium weight</p>
                </div>
                <div>
                  <p className="text-lg text-midnight font-brand mb-2">
                    Body text - Large
                  </p>
                  <p className="text-sm text-gray-600">Regular weight</p>
                </div>
                <div>
                  <p className="text-base text-midnight font-brand mb-2">
                    Body text - Regular
                  </p>
                  <p className="text-sm text-gray-600">Regular weight</p>
                </div>
                <div>
                  <p className="text-sm text-midnight font-brand mb-2">
                    Small text
                  </p>
                  <p className="text-sm text-gray-600">Regular weight</p>
                </div>
              </div>
            </div>
          </section>

          {/* Buttons */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-cloud mb-6">Buttons</h2>
            <div className="card p-6">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-midnight mb-4">Primary Buttons</h3>
                  <div className="flex flex-wrap gap-4">
                    <button className="btn btn-primary">Primary</button>
                    <button className="btn btn-primary" disabled>Disabled</button>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium text-midnight mb-4">Secondary Buttons</h3>
                  <div className="flex flex-wrap gap-4">
                    <button className="btn btn-secondary">Secondary</button>
                    <button className="btn btn-secondary" disabled>Disabled</button>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium text-midnight mb-4">Accent Buttons</h3>
                  <div className="flex flex-wrap gap-4">
                    <button className="btn btn-accent">Accent</button>
                    <button className="btn btn-accent" disabled>Disabled</button>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium text-midnight mb-4">Danger Buttons</h3>
                  <div className="flex flex-wrap gap-4">
                    <button className="btn btn-danger">Danger</button>
                    <button className="btn btn-danger" disabled>Disabled</button>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium text-midnight mb-4">Ghost Buttons</h3>
                  <div className="flex flex-wrap gap-4">
                    <button className="btn btn-ghost">Ghost</button>
                    <button className="btn btn-ghost" disabled>Disabled</button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Form Elements */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-cloud mb-6">Form Elements</h2>
            <div className="card p-6">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-midnight mb-2">
                    Text Input
                  </label>
                  <input
                    type="text"
                    placeholder="Enter text here..."
                    className="input"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-midnight mb-2">
                    Email Input
                  </label>
                  <input
                    type="email"
                    placeholder="Enter email here..."
                    className="input"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-midnight mb-2">
                    Password Input
                  </label>
                  <input
                    type="password"
                    placeholder="Enter password here..."
                    className="input"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-midnight mb-2">
                    Textarea
                  </label>
                  <textarea
                    placeholder="Enter message here..."
                    className="input h-24 resize-none"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Meeting Tiles */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-cloud mb-6">Meeting Tiles</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="meeting-tile">
                <div className="text-center">
                  <div className="w-16 h-16 bg-goldBright rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-midnight"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-semibold mb-4">Create Meeting</h3>
                  <p className="text-gray-200 mb-6">
                    Start a new meeting and invite participants with secure links.
                  </p>
                  <button className="btn btn-accent w-full">
                    Create Room
                  </button>
                </div>
              </div>

              <div className="meeting-tile">
                <div className="text-center">
                  <div className="w-16 h-16 bg-violetDeep rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-cloud"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-semibold mb-4">Join Meeting</h3>
                  <p className="text-gray-200 mb-6">
                    Enter an invite link to join an existing meeting.
                  </p>
                  <button className="btn btn-secondary w-full">
                    Join Meeting
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Badges */}
          <section className="mb-12">
            <h2 className="text-2xl font-semibold text-cloud mb-6">Badges</h2>
            <div className="card p-6">
              <div className="flex flex-wrap gap-4">
                <span className="bg-techBlue text-cloud px-3 py-1 rounded-full text-sm font-medium">
                  Host
                </span>
                <span className="bg-violetDeep text-cloud px-3 py-1 rounded-full text-sm font-medium">
                  Speaker
                </span>
                <span className="bg-goldBright text-midnight px-3 py-1 rounded-full text-sm font-medium">
                  Recording
                </span>
                <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                  Online
                </span>
                <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                  Offline
                </span>
                <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium">
                  Muted
                </span>
              </div>
            </div>
          </section>

          {/* Font Installation Note */}
          <section className="mb-12">
            <div className="card p-6 bg-yellow-50 border-yellow-200">
              <h3 className="text-lg font-semibold text-midnight mb-3">
                Font Installation
              </h3>
              <p className="text-gray-700 mb-4">
                To use the Habs Futurist font, place the WOFF2 file at:
              </p>
              <code className="block bg-gray-100 p-3 rounded text-sm text-midnight mb-4">
                apps/web/public/fonts/habs-futurist.woff2
              </code>
              <p className="text-gray-700">
                Then uncomment and update the @font-face rule in <code>apps/web/src/index.css</code>
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default BrandPage;



