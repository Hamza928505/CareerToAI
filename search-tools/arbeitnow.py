"""Read-only client for the free Arbeitnow job board API (no key).

    search-tools/.venv/Scripts/python search-tools/arbeitnow.py              # page 1, internships and Werkstudent only
    search-tools/.venv/Scripts/python search-tools/arbeitnow.py --all-types  # page 1, every job
    search-tools/.venv/Scripts/python search-tools/arbeitnow.py --check      # offline self-check of the filter

API: https://www.arbeitnow.com/api/job-board-api  (docs: https://www.arbeitnow.com/blog/job-board-api)
Its own terms, returned in every response: "This is a free public API for jobs, please do not abuse.
I would appreciate linking back to the site. By using the API, you agree to the terms of service present
on Arbeitnow.com". Those terms (https://www.arbeitnow.com/terms, section 2) allow personal viewing and
forbid public display, copying and mirroring, and section 11 asks for a link back and lets them revoke API
access. So: use this for your own search, keep each job's Arbeitnow `url`, and do not republish the
listings (for example on the public GJU board) without their permission.
"""
import argparse
import re
import sys

import requests

API = "https://www.arbeitnow.com/api/job-board-api"
HEADERS = {"User-Agent": "CareerToAI-internship-search/1.0 (personal job search; read-only)"}
MAX_PAGES = 3  # ponytail: a hard cap instead of a crawler; this is a personal search, not a mirror

# Words in the title or the job types that mark a student role.
# German compounds (Pflichtpraktikum, Praktikantin) need no word boundary in front; "intern" does, or "Internal" matches.
STUDENT = re.compile(r"\bintern(ship)?\b|praktik(um|ant|antin)|werkstudent|\bworking student\b|\bstudent\b", re.I)


def is_student_job(job):
    text = " ".join([job.get("title", ""), *job.get("job_types", [])])
    return bool(STUDENT.search(text))


def fetch(page=1, visa_sponsorship=None, timeout=20):
    """One page of jobs, plus how many requests the rate limit still allows."""
    params = {"page": page}
    if visa_sponsorship is not None:
        params["visa_sponsorship"] = "true" if visa_sponsorship else "false"
    response = requests.get(API, params=params, headers=HEADERS, timeout=timeout)
    response.raise_for_status()
    remaining = response.headers.get("X-RateLimit-Remaining")
    body = response.json()
    return body["data"], body.get("links", {}).get("next"), int(remaining) if remaining is not None else None


def search(pages=1, student_only=True, visa_sponsorship=None):
    jobs = []
    for page in range(1, min(pages, MAX_PAGES) + 1):
        data, next_page, remaining = fetch(page, visa_sponsorship)
        jobs += [job for job in data if not student_only or is_student_job(job)]
        if not next_page or (remaining is not None and remaining <= 1):
            break
    return jobs


def _check():
    assert is_student_job({"title": "Werkstudent (m/w/d) Data", "job_types": []})
    assert is_student_job({"title": "Marketing", "job_types": ["Internship"]})
    assert is_student_job({"title": "Pflichtpraktikum Logistik", "job_types": []})
    assert is_student_job({"title": "Praktikantin Einkauf", "job_types": []})
    assert not is_student_job({"title": "Senior Backend Engineer", "job_types": ["Full Time"]})
    assert not is_student_job({"title": "Internal Auditor", "job_types": []})
    print("ok")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pages", type=int, default=1, help=f"pages to read (at most {MAX_PAGES})")
    parser.add_argument("--all-types", action="store_true", help="keep every job, not only internships and Werkstudent")
    parser.add_argument("--visa", choices=["true", "false"], help="filter on visa sponsorship")
    parser.add_argument("--check", action="store_true", help="run the offline self-check and exit")
    args = parser.parse_args()
    if args.check:
        _check()
        sys.exit(0)
    found = search(args.pages, not args.all_types, None if args.visa is None else args.visa == "true")
    for job in found:
        print(f"{job['title']} | {job['company_name']} | {job['location']} | {job['url']}")
    print(f"{len(found)} job(s). Source: Arbeitnow (https://www.arbeitnow.com) - link back when you use them.", file=sys.stderr)
