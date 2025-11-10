-- Seed some demo data for testing (optional)
-- Note: This will only work if you have a user account
-- Replace the user_id with your actual user ID from Supabase Auth

-- Example contacts (these won't be inserted automatically due to RLS policies)
-- You can use these as templates in your application

-- INSERT INTO contacts (first_name, last_name, email, phone, company, user_id)
-- VALUES
--   ('Max', 'Mustermann', 'max.mustermann@example.com', '+49 123 456789', 'Musterfirma GmbH', 'YOUR_USER_ID'),
--   ('Erika', 'Musterfrau', 'erika.musterfrau@example.com', '+49 987 654321', 'Beispiel AG', 'YOUR_USER_ID'),
--   ('Hans', 'Schmidt', 'hans.schmidt@example.com', '+49 555 123456', 'Schmidt & Partner', 'YOUR_USER_ID');

-- Create a function to search contacts
CREATE OR REPLACE FUNCTION search_contacts(search_query TEXT, user_uuid UUID)
RETURNS TABLE (
  id UUID,
  first_name VARCHAR,
  last_name VARCHAR,
  email VARCHAR,
  phone VARCHAR,
  mobile VARCHAR,
  company VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.first_name,
    c.last_name,
    c.email,
    c.phone,
    c.mobile,
    c.company
  FROM contacts c
  WHERE c.user_id = user_uuid
    AND (
      c.first_name ILIKE '%' || search_query || '%'
      OR c.last_name ILIKE '%' || search_query || '%'
      OR c.email ILIKE '%' || search_query || '%'
      OR c.company ILIKE '%' || search_query || '%'
    )
  ORDER BY c.last_name, c.first_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
