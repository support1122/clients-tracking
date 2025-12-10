import { useState } from "react";

export default function CreateCampaign() {
  const [campaignName, setCampaignName] = useState("");
  const [campaigners, setCampaigners] = useState("");
  const [links, setLinks] = useState('');
  const [loading, setLoading] = useState(false);
  const API_BASE = import.meta.env.VITE_BASE;

// Validate required environment variables
if (!API_BASE) {
  console.error('❌ VITE_BASE environment variable is required');
}

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/campaign/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName,
          campaigner: campaigners,
        }),
      });
      const data = await res.json();
      setLinks(data.links || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto bg-white shadow rounded-lg p-6">
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-medium">Campaign Name</label>
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="w-full border rounded p-2 mt-1"
            required
          />
          <h1>** try to keep the campaign name & campaigners name unique..</h1>
          <h1>use current date and time for unique campaign name</h1>
          <h1>try avoiding spaces between ..it only increases the hashcode length</h1>
        </div>
        <div>
          <label className="block font-medium">Campaigners (comma-separated)</label>
          <input
            value={campaigners}
            onChange={(e) => setCampaigners(e.target.value)}
            className="w-full border rounded p-2 mt-1"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create"}
        </button>
      </form>

      {links.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold mb-2">Generated Links</h2>
          <ul className="space-y-1">
            {links.map((l, idx) => (
              <li key={idx} className="border rounded p-2 bg-gray-50">
                <span className="font-medium">{l.name}:</span>{" "}
                <a href={l.link} target="_blank" className="text-blue-600 underline">{l.link}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
